# Devfest - AI-Powered Learning Assistant

A modern, dark-themed learning assistant application built with React, TypeScript, and Tailwind CSS.

## Features

- **Chrome Extension UI**: Draggable overlay, popup with tabs, side panel, and status indicators
- **Personal Dashboard**: 3-panel layout with session timeline, markdown editor, and notebook entries
- **Enterprise Pages**: Overview, Documents, Suggestions, and Analytics charts
- **Landing Page**: Multi-step wizard with persona setup, install guide, and onboarding
- **Rich Animations**: Framer Motion for smooth transitions and interactions
- **Dark Theme**: Tailwind CSS with custom dark theme inspired by ready.so

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **React Router v6** for routing
- **React Query** for data fetching
- **Zustand** for state management
- **Axios** for HTTP requests
- **React Hook Form** + **Zod** for form validation
- **Framer Motion** for animations
- **Recharts** for data visualization
- **React Markdown** for markdown rendering

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview

```bash
npm run preview
```

## Project Structure

```
src/
├── components/
│   ├── extension/      # Chrome extension UI components
│   ├── personal/       # Personal dashboard components
│   ├── enterprise/     # Enterprise page components
│   ├── landing/        # Landing page components
│   └── ui/             # Reusable UI components
├── pages/
│   ├── LandingPage.tsx
│   ├── PersonalPage.tsx
│   └── enterprise/     # Enterprise pages
├── store/              # Zustand stores
├── lib/                # Utilities and API client
└── App.tsx             # Main app component
```

## Environment Variables

Create a `.env` file:

```
VITE_API_URL=http://localhost:8000/api
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

## Google OAuth Setup

This app uses **Google Identity Services** (OAuth 2.0) - the modern, recommended approach. 

**Important**: No deprecated Google+ API is used. The implementation uses the built-in Google Identity Services SDK.

See [GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md) for detailed setup instructions.

## License

MIT
