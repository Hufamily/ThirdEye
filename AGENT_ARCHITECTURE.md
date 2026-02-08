# ThirdEye Agent Architecture Specification

## Overview

ThirdEye uses a multi-layered agent architecture orchestrated via **Dedalus Labs** platform, with **K2-Think (Kimi K2 Thinking)** reasoning model powering complex reasoning tasks. The system processes user interactions on web pages and Google Docs to provide intelligent learning assistance.

## Technology Stack

### Dedalus Labs
- **Purpose**: Agent orchestration platform with MCP (Model Context Protocol) integration
- **Features**: 
  - Multi-model routing with intelligent handoffs
  - Tool calling and structured outputs
  - Secure multi-tenant authentication
  - Production-grade Python/TypeScript SDKs
- **Use Case**: Orchestrates all agents, manages agent communication, handles routing between agents

### K2-Think (Kimi K2 Thinking)
- **Purpose**: Deep reasoning model for complex problem-solving
- **Capabilities**:
  - 256K context window (process entire research papers)
  - Step-by-step reasoning with transparent thought process
  - 200-300 sequential tool calls without degradation
  - 100% accuracy on AIME25 math problems
  - Native INT4 quantization (2x speed-up)
- **Use Case**: Powers reasoning-heavy agents (Agent 3.0, Agent 4.0) for knowledge gap analysis and explanation generation

---

## Layer 0: Identity & Routing Layer

### Agent 0.0 — The Persona Architect

**Role**: Identity Builder  
**Purpose**: Constructs a comprehensive "Knowledge Profile" of the user by analyzing their digital footprint.

#### Input Sources
1. **Google Docs Metadata**
   - Document titles, folder structures, sharing patterns
   - Document modification timestamps
   - Document types (technical docs, notes, presentations)
   - Collaboration patterns (who they work with)

2. **Search History** (from extension)
   - Queries made during learning sessions
   - Topics searched repeatedly
   - Time spent on different domains
   - Search-to-click patterns

3. **Session Data**
   - Confusion triggers (scroll, hover, click patterns)
   - Gap labels identified in previous sessions
   - Concepts learned vs. concepts struggled with
   - Time spent on different content types

#### Processing Logic
```python
# Pseudocode
def build_persona_card(user_id):
    # Analyze Google Docs
    docs_metadata = fetch_google_docs_metadata(user_id)
    expertise_areas = extract_expertise_from_docs(docs_metadata)
    
    # Analyze search history
    search_patterns = analyze_search_history(user_id)
    learning_interests = identify_learning_interests(search_patterns)
    
    # Analyze session data
    session_history = fetch_session_history(user_id)
    knowledge_gaps = identify_recurring_gaps(session_history)
    
    # Build PersonaCard
    return PersonaCard(
        expertise_levels=expertise_areas,  # Dict[str, "beginner"|"intermediate"|"advanced"|"expert"]
        learning_style=infer_learning_style(session_history),  # "visual"|"auditory"|"reading"|"kinesthetic"
        active_projects=extract_active_projects(docs_metadata),
        preferred_topics=learning_interests,
        known_gaps=knowledge_gaps,
        learning_velocity=calculate_learning_velocity(session_history)
    )
```

#### Output: PersonaCard JSON
```json
{
  "userId": "user_123",
  "expertiseLevels": {
    "react": "intermediate",
    "typescript": "advanced",
    "machine-learning": "beginner",
    "mathematics": "expert"
  },
  "learningStyle": "visual",
  "activeProjects": [
    {
      "name": "React Best Practices Guide",
      "docId": "1a2b3c4d5e6f7g8h9i0j",
      "lastAccessed": "2024-02-07T10:30:00Z"
    }
  ],
  "preferredTopics": ["react-hooks", "performance-optimization", "state-management"],
  "knownGaps": ["dependency-arrays", "memoization-patterns"],
  "learningVelocity": 0.75,  // 0-1 scale
  "timeCommitment": "3-5h",  // "1-2h"|"3-5h"|"6-10h"|"10h+"
  "goals": ["master-react-hooks", "improve-performance"],
  "challenges": ["understanding-closures", "async-state-management"]
}
```

#### Implementation Details
- **Trigger**: Runs on user login and updates every 24 hours or after significant activity
- **Storage**: PersonaCard cached in database, updated incrementally
- **Dedalus Integration**: Uses Dedalus SDK for orchestration, can call other agents for analysis

---

### Agent 0.5 — The Traffic Controller

**Role**: Routing & Mode Detection  
**Purpose**: Determines the operational mode based on current page context.

#### Detection Logic
```python
def detect_mode(url: str, page_content: dict) -> Mode:
    # Check URL patterns
    if "docs.google.com" in url:
        # Verify it's actually editable (not just viewing)
        if page_content.get("is_editable", False):
            return Mode.EDITABLE
        else:
            return Mode.READ_ONLY
    
    # Check for other collaborative platforms
    elif "notion.so" in url or "confluence.atlassian.com" in url:
        return Mode.EDITABLE
    
    # Default to read-only for static websites
    else:
        return Mode.READ_ONLY
```

#### Mode Types

**EDITABLE Mode**
- **Conditions**: 
  - URL matches `docs.google.com/document/*/edit`
  - User has edit permissions
  - Document is in whitelisted folder (for enterprise)
- **Capabilities**:
  - Agent 6.0 (Document Surgeon) is active
  - Can apply edits directly to document
  - Aggregates friction from all users
  - Real-time collaboration features

**READ_ONLY Mode**
- **Conditions**: 
  - Static websites (articles, documentation)
  - Google Docs in view-only mode
  - PDF viewers
- **Capabilities**:
  - Agent 6.0 is inactive
  - Focus on personal learning assistance
  - No document editing capabilities

#### Output
```json
{
  "mode": "EDITABLE" | "READ_ONLY",
  "url": "https://docs.google.com/document/d/.../edit",
  "docId": "1a2b3c4d5e6f7g8h9i0j",
  "isWhitelisted": true,  // For enterprise mode
  "permissions": ["read", "write"],
  "detectedAt": "2024-02-07T10:30:00Z"
}
```

#### Implementation Details
- **Trigger**: Runs on every page navigation/load
- **Performance**: Must be fast (<50ms) to not block page load
- **Caching**: Cache mode detection results per URL

---

## Layer 1: Context Layer

### Agent 1.0 — The Capture & Scrape

**Role**: "The Eyes" - Content Extraction  
**Purpose**: Captures text content under the cursor when user dwells for 2 seconds.

#### Dwell Detection
- **Trigger**: Mouse cursor stationary for 2000ms (configurable)
- **Context Window**: 10 lines before and after cursor position
- **Fallback**: Gaze tracking API if available (`/gaze` endpoint)

#### Extraction Logic

**For Google Docs (EDITABLE mode)**
```python
def extract_from_google_docs(cursor_position, doc_id):
    # Use Google Docs API to get text at cursor
    # Generate deterministic anchor_id
    text_segment = get_text_at_position(cursor_position)
    dom_path = get_dom_path(cursor_position)
    
    # Create deterministic anchor_id
    anchor_id = hash(f"{text_segment[:100]}_{dom_path}")
    
    return {
        "text": text_segment,
        "anchor_id": anchor_id,
        "doc_id": doc_id,
        "start_index": get_start_index(cursor_position),
        "end_index": get_end_index(cursor_position),
        "aoi_type": detect_aoi_type(text_segment),  # paragraph, heading, equation, code, etc.
        "metadata": {
            "font_size": get_font_size(cursor_position),
            "formatting": get_formatting(cursor_position),
            "surrounding_context": get_surrounding_lines(cursor_position, lines=10)
        }
    }
```

**For Static Websites (READ_ONLY mode)**
```python
def extract_from_website(cursor_position):
    # Use general article tag scraper
    # Look for semantic HTML tags: <article>, <main>, <section>, <p>
    article_element = find_nearest_article_element(cursor_position)
    
    if article_element:
        text = extract_text_from_element(article_element)
        # Use article structure for anchor
        anchor_id = hash(f"{article_element.tag}_{article_element.xpath}")
    else:
        # Fallback to paragraph extraction
        text = extract_paragraph_at_cursor(cursor_position)
        anchor_id = hash(f"{text[:100]}_{cursor_position}")
    
    return {
        "text": text,
        "anchor_id": anchor_id,
        "url": current_url,
        "aoi_type": detect_aoi_type(text),
        "metadata": {
            "page_title": get_page_title(),
            "domain": get_domain(),
            "article_structure": get_article_structure()
        }
    }
```

#### Output: CaptureResult
```json
{
  "anchor_id": "aoi_abc123def456",
  "doc_id": "1a2b3c4d5e6f7g8h9i0j",
  "text": "The dependency array determines when the effect runs...",
  "aoi_type": "paragraph",
  "start_index": 200,
  "end_index": 280,
  "bbox_screen": [100, 120, 700, 360],
  "timestamp_ms": 1707300000000,
  "metadata": {
    "surrounding_context": "...",
    "formatting": {"bold": false, "italic": false}
  }
}
```

#### Implementation Details
- **Performance**: Must complete in <100ms to feel instant
- **Error Handling**: Graceful fallback if extraction fails
- **Caching**: Cache extraction results per anchor_id to avoid re-processing

---

### Agent 2.0 — The Target Interpreter

**Role**: Content Classification  
**Purpose**: Classifies captured content using PersonaCard to understand context and user's perspective.

#### Classification Logic
```python
def classify_content(capture_result: CaptureResult, persona_card: PersonaCard):
    # Use PersonaCard to understand user's expertise level
    expertise_level = persona_card.expertise_levels.get(
        infer_domain(capture_result.text), 
        "beginner"
    )
    
    # Classify content type
    content_type = classify_aoi_type(capture_result)
    
    # Determine complexity relative to user
    complexity = assess_complexity(
        capture_result.text,
        expertise_level,
        persona_card.known_gaps
    )
    
    # Identify specific concepts
    concepts = extract_concepts(capture_result.text)
    
    # Check if this relates to known gaps
    relates_to_gap = check_gap_relevance(concepts, persona_card.known_gaps)
    
    return ClassificationResult(
        content_type=content_type,
        complexity=complexity,
        concepts=concepts,
        relates_to_gap=relates_to_gap,
        user_context={
            "expertise_level": expertise_level,
            "learning_style": persona_card.learning_style,
            "relevant_projects": find_relevant_projects(concepts, persona_card.active_projects)
        }
    )
```

#### Classification Types
- **Equation**: Mathematical formulas, equations
- **Code**: Code blocks, snippets, technical syntax
- **Legal Jargon**: Legal terms, contracts, terms of service
- **Technical Concept**: Domain-specific terminology
- **Procedure**: Step-by-step instructions
- **Definition**: Term definitions, explanations
- **Example**: Code examples, use cases
- **Warning/Note**: Important callouts, gotchas

#### Output: ClassificationResult
```json
{
  "content_type": "technical_concept",
  "aoi_type": "paragraph",
  "complexity": "intermediate",  // relative to user's expertise
  "concepts": ["dependency-array", "useEffect", "react-hooks"],
  "relates_to_gap": true,
  "gap_label": "dependency-arrays",
  "user_context": {
    "expertise_level": "intermediate",
    "learning_style": "visual",
    "relevant_projects": ["React Best Practices Guide"],
    "estimated_difficulty": 0.6  // 0-1 scale
  },
  "classification_confidence": 0.92
}
```

#### Implementation Details
- **Model**: Can use lightweight classification model (not K2-Think - too expensive)
- **Caching**: Cache classification results per anchor_id
- **Dedalus Integration**: Uses Dedalus SDK for model routing

---

## Layer 2: Reasoning Layer

### Agent 3.0 — The Knowledge Gap Hypothesis

**Role**: "The Predictor" - Gap Analysis  
**Purpose**: Hypothesizes why the user is stuck using deep reasoning.

**Uses K2-Think Reasoning Model** 🧠

#### Input
- ClassificationResult from Agent 2.0
- PersonaCard from Agent 0.0
- Session history (previous confusion patterns)
- Related content from same document/page

#### Reasoning Process (K2-Think)
```python
def hypothesize_gaps(classification_result, persona_card, session_history):
    # Build reasoning prompt for K2-Think
    prompt = build_reasoning_prompt(
        content=classification_result.text,
        user_expertise=persona_card.expertise_levels,
        known_gaps=persona_card.known_gaps,
        session_history=session_history,
        concepts=classification_result.concepts
    )
    
    # Call K2-Think with step-by-step reasoning
    reasoning_result = k2_think.complete(
        prompt=prompt,
        mode="thinking",  # Enable step-by-step reasoning
        max_tokens=2000,  # Allow deep reasoning
        temperature=0.3  # Lower for more deterministic reasoning
    )
    
    # Parse K2-Think's reasoning steps
    hypotheses = parse_reasoning_steps(reasoning_result)
    
    return GapHypotheses(
        candidates=hypotheses,
        reasoning_steps=reasoning_result.thinking_steps,
        confidence_scores=calculate_confidence(hypotheses)
    )
```

#### Reasoning Prompt Template
```
You are analyzing why a user might be confused about this content:

Content: "{content}"
User Expertise: {expertise_levels}
Known Gaps: {known_gaps}
Previous Confusion Patterns: {session_history}

Step 1: Identify prerequisite knowledge needed to understand this content
Step 2: Compare prerequisites with user's known expertise
Step 3: Identify specific gaps that would cause confusion
Step 4: Rank gaps by likelihood and impact
Step 5: Generate 2-4 hypotheses with confidence scores

Show your reasoning step-by-step.
```

#### Output: GapHypotheses
```json
{
  "candidates": [
    {
      "id": "gap_1",
      "hypothesis": "Missing prerequisite: Understanding of closure scope in JavaScript",
      "confidence": 0.92,
      "reasoning": "The content references 'dependency array' which relies on understanding closure scope. User's known gaps include 'dependency-arrays' and their expertise in JavaScript is intermediate, suggesting they may not fully understand closure mechanics.",
      "prerequisites": ["closure-scope", "lexical-scoping"],
      "impact": "high",
      "evidence": [
        "User has struggled with dependency arrays in previous sessions",
        "Content uses closure-related terminology without explanation"
      ]
    },
    {
      "id": "gap_2",
      "hypothesis": "Missing prerequisite: Understanding of React's rendering cycle",
      "confidence": 0.78,
      "reasoning": "The content explains when effects run but doesn't explain the rendering cycle context. User's intermediate React expertise suggests they may understand hooks but not the full rendering picture.",
      "prerequisites": ["react-rendering-cycle", "reconciliation"],
      "impact": "medium",
      "evidence": [
        "User has intermediate React expertise",
        "Content assumes rendering cycle knowledge"
      ]
    }
  ],
  "reasoning_steps": [
    "Analyzed content type: technical_concept about dependency arrays",
    "Identified prerequisites: closure scope, rendering cycle, effect lifecycle",
    "Compared with user expertise: intermediate React, intermediate JavaScript",
    "Found gap: closure scope understanding (high confidence)",
    "Found gap: rendering cycle context (medium confidence)"
  ],
  "winning_hypothesis": "gap_1",
  "overall_confidence": 0.85
}
```

#### Implementation Details
- **Model**: K2-Think via Dedalus Labs (routed specifically for this agent)
- **Performance**: Can take 2-5 seconds for deep reasoning (acceptable for this use case)
- **Caching**: Cache hypotheses per anchor_id + user_id combination
- **Fallback**: If K2-Think unavailable, use lighter model with simpler heuristics

---

### Agent 4.0 — The Explanation Composer

**Role**: "The Writer" - Response Generation  
**Purpose**: Crafts explanations based on winning gap hypothesis.

**Uses K2-Think Reasoning Model** 🧠

#### Input
- Winning hypothesis from Agent 3.0
- Original content from Agent 1.0
- PersonaCard (learning style, expertise)
- User's reading state (confused, interested, skimming, revising)

#### Explanation Generation (K2-Think)
```python
def compose_explanation(winning_hypothesis, content, persona_card, reading_state):
    # Build explanation prompt
    prompt = build_explanation_prompt(
        gap_hypothesis=winning_hypothesis,
        original_content=content,
        learning_style=persona_card.learning_style,
        expertise_level=persona_card.expertise_levels,
        reading_state=reading_state
    )
    
    # Generate instant HUD overlay (short explanation)
    hud_response = k2_think.complete(
        prompt=prompt + "\nGenerate a concise 2-3 sentence explanation for instant overlay.",
        mode="thinking",
        max_tokens=150,
        temperature=0.4
    )
    
    # Generate deep-dive chat response (detailed explanation)
    deep_dive_response = k2_think.complete(
        prompt=prompt + "\nGenerate a detailed explanation with examples, analogies, and step-by-step breakdown.",
        mode="thinking",
        max_tokens=1000,
        temperature=0.5
    )
    
    return ExplanationResult(
        instant_hud=hud_response,
        deep_dive=deep_dive_response,
        examples=extract_examples(deep_dive_response),
        analogies=extract_analogies(deep_dive_response),
        next_steps=suggest_next_steps(winning_hypothesis)
    )
```

#### Explanation Prompt Template
```
You are explaining a concept to address a specific knowledge gap.

Gap Hypothesis: {hypothesis}
Original Content: {content}
User's Learning Style: {learning_style}
User's Expertise Level: {expertise_level}
Reading State: {reading_state}

Generate an explanation that:
1. Directly addresses the identified gap
2. Matches the user's learning style ({learning_style})
3. Assumes {expertise_level} level knowledge
4. Uses appropriate tone for {reading_state} state
5. Includes concrete examples and analogies
6. Provides actionable next steps

Show your reasoning for why this explanation will be effective.
```

#### Output: ExplanationResult
```json
{
  "instant_hud": {
    "title": "Understanding Dependency Arrays",
    "body": "The dependency array tells React which values to watch. When any value in the array changes, React re-runs your effect. Think of it like a shopping list - React only goes shopping (runs the effect) when items on the list change.",
    "key_points": [
      "Dependency array = list of watched values",
      "Effect runs when array values change",
      "Empty array = run once on mount"
    ]
  },
  "deep_dive": {
    "full_explanation": "...",
    "examples": [
      {
        "type": "code",
        "content": "useEffect(() => { console.log('runs when count changes') }, [count])"
      }
    ],
    "analogies": [
      {
        "title": "Shopping List Analogy",
        "description": "The dependency array is like a shopping list..."
      }
    ],
    "step_by_step": [
      "Step 1: Understand what values your effect depends on",
      "Step 2: Add those values to the dependency array",
      "Step 3: React will re-run the effect when those values change"
    ],
    "common_mistakes": [
      "Forgetting to include all dependencies",
      "Including values that don't need to be watched"
    ],
    "next_steps": [
      "Try modifying the dependency array in your code",
      "Read about closure scope in JavaScript",
      "Practice with the React Hooks documentation"
    ]
  },
  "action_cards": [
    {
      "title": "Quick Explanation",
      "body": "{instant_hud.body}",
      "buttons": ["Explain Deeper", "Dismiss", "I Know This"]
    },
    {
      "title": "Practice Exercise",
      "body": "Try writing a useEffect that only runs when a specific prop changes.",
      "buttons": ["Show Solution", "Try It", "Skip"]
    }
  ]
}
```

#### Implementation Details
- **Model**: K2-Think via Dedalus Labs
- **Performance**: 
  - Instant HUD: <1 second (can be cached)
  - Deep dive: 2-4 seconds (acceptable for detailed explanation)
- **Personalization**: Heavily uses PersonaCard for tone and complexity
- **Caching**: Cache explanations per hypothesis + content combination

---

## Layer 3: Intelligence & Action Layer

### Agent 5.0 — The Personal Memory Vault

**Role**: Tutor & Learning Tracker  
**Purpose**: Logs every interaction for spaced repetition and habit tracking.

#### Data Collection
```python
def log_interaction(session_data):
    interaction = {
        "timestamp": datetime.now(),
        "user_id": session_data.user_id,
        "doc_id": session_data.doc_id,
        "anchor_id": session_data.anchor_id,
        "content": session_data.content,
        "gap_hypothesis": session_data.gap_hypothesis,
        "explanation_given": session_data.explanation,
        "user_feedback": session_data.feedback,  # "helpful", "not helpful", "already knew"
        "reading_state": session_data.reading_state,
        "dwell_time": session_data.dwell_time,
        "concepts": session_data.concepts
    }
    
    # Store in database
    save_interaction(interaction)
    
    # Update learning metrics
    update_learning_metrics(interaction)
    
    # Schedule spaced repetition
    schedule_repetition(interaction)
```

#### Features

**1. Spaced Repetition**
```python
def schedule_repetition(interaction):
    # Calculate next review time using spaced repetition algorithm
    next_review = calculate_next_review(
        concept=interaction.concepts[0],
        user_mastery=get_user_mastery(interaction.user_id, interaction.concepts[0]),
        difficulty=interaction.gap_hypothesis.complexity
    )
    
    schedule_review_notification(
        user_id=interaction.user_id,
        concept=interaction.concepts[0],
        review_time=next_review,
        review_content=generate_review_content(interaction)
    )
```

**2. Habit Tracking**
```python
def track_learning_habits(user_id):
    # Analyze learning patterns
    daily_sessions = get_daily_sessions(user_id, days=30)
    
    habits = {
        "average_session_length": calculate_avg_session_length(daily_sessions),
        "most_productive_time": find_most_productive_time(daily_sessions),
        "learning_streak": calculate_streak(daily_sessions),
        "concepts_learned_this_week": count_concepts_learned(daily_sessions, days=7),
        "top_struggling_areas": identify_struggling_areas(daily_sessions)
    }
    
    return habits
```

**3. Notebook Entry Generation**
```python
def generate_notebook_entry(interaction):
    # Create structured notebook entry
    entry = {
        "title": generate_title(interaction.concepts),
        "content": format_as_markdown(interaction),
        "concepts": interaction.concepts,
        "tags": extract_tags(interaction),
        "related_entries": find_related_entries(interaction),
        "review_schedule": get_review_schedule(interaction.concepts)
    }
    
    save_notebook_entry(entry)
    return entry
```

#### Output: LearningMetrics
```json
{
  "session_id": "session_123",
  "interactions_logged": 15,
  "concepts_learned": ["dependency-arrays", "closure-scope"],
  "mastery_progress": {
    "dependency-arrays": 0.65,  // 0-1 scale
    "closure-scope": 0.45
  },
  "spaced_repetition_scheduled": [
    {
      "concept": "dependency-arrays",
      "next_review": "2024-02-10T10:00:00Z",
      "review_type": "quiz"
    }
  ],
  "habits": {
    "learning_streak": 7,
    "average_session_length_minutes": 25,
    "most_productive_time": "10:00-12:00"
  }
}
```

#### Implementation Details
- **Storage**: PostgreSQL database with time-series optimization
- **Performance**: Async logging to not block user interaction
- **Privacy**: All data stored per-user, encrypted at rest

---

### Agent 6.0 — The Document Surgeon (Enterprise Only)

**Role**: Aggregator & Editor  
**Purpose**: Aggregates friction from all users and applies optimizations to Google Docs.

**Active Only In**: EDITABLE mode on whitelisted documents

#### Aggregation Logic
```python
def aggregate_friction(doc_id, time_window_days=30):
    # Get all confusion events for this document
    confusion_events = get_confusion_events(
        doc_id=doc_id,
        time_window_days=time_window_days
    )
    
    # Group by anchor_id (same content area)
    grouped_events = group_by_anchor(confusion_events)
    
    # Calculate friction metrics
    friction_hotspots = []
    for anchor_id, events in grouped_events.items():
        hotspot = {
            "anchor_id": anchor_id,
            "confusion_count": len(events),
            "unique_users": count_unique_users(events),
            "average_dwell_time": calculate_avg_dwell(events),
            "common_gaps": find_common_gaps(events),
            "intensity": calculate_intensity(events),  # 0-100 scale
            "unmet_need": infer_unmet_need(events)
        }
        friction_hotspots.append(hotspot)
    
    return friction_hotspots
```

#### Suggestion Generation (Uses K2-Think)
```python
def generate_suggestions(friction_hotspot, original_content):
    # Use K2-Think to analyze and suggest improvements
    prompt = build_suggestion_prompt(
        original_content=original_content,
        confusion_patterns=friction_hotspot.common_gaps,
        unmet_need=friction_hotspot.unmet_need,
        user_count=friction_hotspot.unique_users
    )
    
    suggestion = k2_think.complete(
        prompt=prompt,
        mode="thinking",
        max_tokens=500,
        temperature=0.3
    )
    
    return {
        "original_text": original_content,
        "suggested_text": suggestion.rewritten_text,
        "reasoning": suggestion.reasoning_steps,
        "confidence": suggestion.confidence,
        "changes_made": suggestion.changes_summary
    }
```

#### Batch Update Execution
```python
def apply_edit_to_google_doc(suggestion, doc_id):
    # Prepare Google Docs API batchUpdate request
    requests = [
        {
            "deleteContent": {
                "range": {
                    "startIndex": suggestion.start_index,
                    "endIndex": suggestion.end_index
                }
            }
        },
        {
            "insertText": {
                "location": {
                    "index": suggestion.start_index
                },
                "text": suggestion.suggested_text
            }
        }
    ]
    
    # Execute via Google Docs API
    result = google_docs_api.batchUpdate(
        documentId=doc_id,
        requests=requests
    )
    
    # Log the change
    log_document_change(
        doc_id=doc_id,
        suggestion_id=suggestion.id,
        applied_at=datetime.now(),
        applied_by="system"
    )
    
    return result
```

#### Output: SuggestionResult
```json
{
  "suggestion_id": "suggestion_123",
  "document_id": "1a2b3c4d5e6f7g8h9i0j",
  "hotspot_id": "hotspot_456",
  "original_text": "The dependency array determines when the effect runs.",
  "suggested_text": "The dependency array controls when the effect runs. When any value in this array changes, React will re-run your effect function. An empty array [] means the effect runs only once when the component mounts.",
  "reasoning": [
    "Original text assumes knowledge of dependency arrays",
    "Added explanation of what happens when values change",
    "Added clarification about empty array behavior",
    "Used 'controls' instead of 'determines' for clarity"
  ],
  "confidence": 0.87,
  "users_affected": 23,
  "confusion_count": 45,
  "google_doc_range": {
    "startIndex": 200,
    "endIndex": 280
  },
  "status": "pending" | "accepted" | "rejected" | "applied"
}
```

#### Implementation Details
- **Permissions**: Only works on documents user has edit access to
- **Whitelisting**: Enterprise admin can whitelist specific folders/documents
- **Approval Flow**: Can require admin approval before applying edits
- **Rollback**: Maintains version history for easy rollback
- **Model**: K2-Think for high-quality suggestions

---

## Agent Communication Flow

### Typical User Interaction Flow

```
User hovers over content for 2 seconds
    ↓
Agent 0.5 (Traffic Controller) detects mode
    ↓
Agent 1.0 (Capture & Scrape) extracts content
    ↓
Agent 0.0 (Persona Architect) provides PersonaCard (cached)
    ↓
Agent 2.0 (Target Interpreter) classifies content
    ↓
Agent 3.0 (Knowledge Gap Hypothesis) reasons about gaps [K2-Think]
    ↓
Agent 4.0 (Explanation Composer) generates explanation [K2-Think]
    ↓
Display instant HUD overlay
    ↓
Agent 5.0 (Memory Vault) logs interaction
    ↓
[If EDITABLE mode] Agent 6.0 aggregates friction for document improvement
```

### Dedalus Labs Orchestration

```python
# Example using Dedalus SDK
from dedalus import Agent, Router

# Define agents
persona_architect = Agent("persona_architect", model="gpt-4")
traffic_controller = Agent("traffic_controller", model="gpt-4-turbo")
capture_scrape = Agent("capture_scrape", model="gpt-4-turbo")
target_interpreter = Agent("target_interpreter", model="gpt-4-turbo")
gap_hypothesis = Agent("gap_hypothesis", model="k2-think")  # K2-Think
explanation_composer = Agent("explanation_composer", model="k2-think")  # K2-Think
memory_vault = Agent("memory_vault", model="gpt-4")
document_surgeon = Agent("document_surgeon", model="k2-think")  # K2-Think

# Create router with intelligent handoffs
router = Router([
    persona_architect,
    traffic_controller,
    capture_scrape,
    target_interpreter,
    gap_hypothesis,
    explanation_composer,
    memory_vault,
    document_surgeon
])

# Orchestrate flow
result = await router.route(
    input_data=user_interaction,
    flow="standard_learning_assistance"
)
```

---

## Data Structures

### PersonaCard
```typescript
interface PersonaCard {
  userId: string
  expertiseLevels: Record<string, "beginner" | "intermediate" | "advanced" | "expert">
  learningStyle: "visual" | "auditory" | "reading" | "kinesthetic"
  activeProjects: Array<{
    name: string
    docId: string
    lastAccessed: string
  }>
  preferredTopics: string[]
  knownGaps: string[]
  learningVelocity: number  // 0-1
  timeCommitment: "1-2h" | "3-5h" | "6-10h" | "10h+"
  goals: string[]
  challenges: string[]
}
```

### GapHypothesis
```typescript
interface GapHypothesis {
  id: string
  hypothesis: string
  confidence: number  // 0-1
  reasoning: string
  prerequisites: string[]
  impact: "low" | "medium" | "high"
  evidence: string[]
}
```

### ExplanationResult
```typescript
interface ExplanationResult {
  instantHud: {
    title: string
    body: string
    keyPoints: string[]
  }
  deepDive: {
    fullExplanation: string
    examples: Array<{ type: string; content: string }>
    analogies: Array<{ title: string; description: string }>
    stepByStep: string[]
    commonMistakes: string[]
    nextSteps: string[]
  }
  actionCards: Array<{
    title: string
    body: string
    buttons: string[]
  }>
}
```

---

## Performance Requirements

| Agent | Max Latency | Model Used |
|-------|-------------|------------|
| Agent 0.0 (Persona Architect) | 500ms (cached) | GPT-4 |
| Agent 0.5 (Traffic Controller) | 50ms | Lightweight |
| Agent 1.0 (Capture & Scrape) | 100ms | N/A (DOM parsing) |
| Agent 2.0 (Target Interpreter) | 200ms | GPT-4 Turbo |
| Agent 3.0 (Gap Hypothesis) | 2-5s | **K2-Think** |
| Agent 4.0 (Explanation Composer) | 1-4s | **K2-Think** |
| Agent 5.0 (Memory Vault) | Async | N/A (DB write) |
| Agent 6.0 (Document Surgeon) | 3-10s | **K2-Think** |

---

## Next Steps

1. **Set up Dedalus Labs account** and configure MCP servers
2. **Integrate K2-Think API** (kimi-k2.ai) for reasoning agents
3. **Implement Agent 0.0** (Persona Architect) with Google Docs API
4. **Implement Agent 0.5** (Traffic Controller) with URL detection
5. **Implement Agent 1.0** (Capture & Scrape) with DOM extraction
6. **Implement Agent 2.0** (Target Interpreter) with classification
7. **Implement Agent 3.0** (Gap Hypothesis) with K2-Think integration
8. **Implement Agent 4.0** (Explanation Composer) with K2-Think integration
9. **Implement Agent 5.0** (Memory Vault) with database storage
10. **Implement Agent 6.0** (Document Surgeon) with Google Docs API + K2-Think

---

## Summary: Dedalus Labs & K2-Think Explained

### Dedalus Labs
**What it is**: An AI cloud platform for building and deploying agents, backed by Y Combinator.

**Key Features**:
- **Model-Agnostic**: Works with any AI model (OpenAI, Anthropic, Google, xAI, Mistral, DeepSeek)
- **MCP Integration**: Model Context Protocol for secure multi-tenant authentication
- **Agent Orchestration**: Python/TypeScript SDKs for building complex agent workflows
- **Unified API**: OpenAI-compatible API for chat, embeddings, audio, image generation
- **Intelligent Routing**: Multi-model routing with automatic handoffs

**Why we use it**: 
- Orchestrates all 7 agents in ThirdEye
- Handles routing between agents intelligently
- Provides unified interface to multiple AI models
- Manages authentication and security
- Production-grade SDKs for reliable deployment

### K2-Think (Kimi K2 Thinking)
**What it is**: The world's most capable open-source reasoning model, specializing in deep reasoning.

**Key Capabilities**:
- **256K Context Window**: Process entire research papers in one go
- **Step-by-Step Reasoning**: Shows transparent thought process (like showing your work)
- **200-300 Sequential Tool Calls**: Chain complex operations without degradation
- **100% Accuracy on AIME25**: Perfect score on competition-level math problems
- **Native INT4 Quantization**: 2x speed-up with zero accuracy loss
- **1T Parameters (32B Active)**: Mixture-of-Experts architecture

**Why we use it**:
- **Agent 3.0 (Gap Hypothesis)**: Needs deep reasoning to understand WHY users are confused
- **Agent 4.0 (Explanation Composer)**: Needs sophisticated reasoning to craft personalized explanations
- **Agent 6.0 (Document Surgeon)**: Needs reasoning to suggest document improvements

**Performance**: 
- Reasoning tasks: 2-5 seconds (acceptable for complex analysis)
- Explanation generation: 1-4 seconds
- Much better than GPT-4 for multi-step reasoning tasks
