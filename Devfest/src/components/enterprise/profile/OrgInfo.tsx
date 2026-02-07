import { Building2, Users, Mail, Calendar } from 'lucide-react'

interface OrgInfoProps {
  orgName?: string
  adminEmail?: string
  memberCount?: number
  createdAt?: string
}

export function OrgInfo({
  orgName,
  adminEmail,
  memberCount = 0,
  createdAt,
}: OrgInfoProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Organization Information</h3>
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <Building2 className="w-5 h-5 text-muted-foreground" />
          <div className="flex-1">
            <div className="text-sm text-muted-foreground">Organization Name</div>
            <div className="font-medium">{orgName || 'Not set'}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <Mail className="w-5 h-5 text-muted-foreground" />
          <div className="flex-1">
            <div className="text-sm text-muted-foreground">Admin Email</div>
            <div className="font-medium">{adminEmail || 'Not set'}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <Users className="w-5 h-5 text-muted-foreground" />
          <div className="flex-1">
            <div className="text-sm text-muted-foreground">Team Members</div>
            <div className="font-medium">{memberCount} members</div>
          </div>
        </div>
        {createdAt && (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-sm text-muted-foreground">Created</div>
              <div className="font-medium">{new Date(createdAt).toLocaleDateString()}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
