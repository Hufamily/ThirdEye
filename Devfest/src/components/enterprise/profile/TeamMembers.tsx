import { Users, Mail, Shield, MoreVertical } from 'lucide-react'

interface TeamMember {
  id: string
  name: string
  email: string
  role: 'admin' | 'member'
}

interface TeamMembersProps {
  members?: TeamMember[]
  isAdmin?: boolean
}

export function TeamMembers({ members = [], isAdmin = false }: TeamMembersProps) {
  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5" />
        <h3 className="text-lg font-semibold">Team Members</h3>
      </div>

      {members.length > 0 ? (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Users className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {member.name}
                    {member.role === 'admin' && (
                      <Shield className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {member.email}
                  </div>
                </div>
              </div>
              <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 bg-muted/50 rounded-lg border border-border text-center">
          <p className="text-muted-foreground">No team members</p>
        </div>
      )}
    </div>
  )
}
