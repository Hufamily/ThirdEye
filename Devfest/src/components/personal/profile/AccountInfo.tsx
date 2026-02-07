import { User, Mail, CheckCircle2, XCircle } from 'lucide-react'

interface AccountInfoProps {
  name?: string
  email?: string
  googleConnected?: boolean
}

export function AccountInfo({ name, email, googleConnected = false }: AccountInfoProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold">Account Information</h3>
      <div className="space-y-2">
        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
          <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">Name</div>
            <div className="text-sm font-medium truncate">{name || 'Not set'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
          <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">Email</div>
            <div className="text-sm font-medium truncate">{email || 'Not set'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
          {googleConnected ? (
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">Google Account</div>
            <div className="text-sm font-medium">
              {googleConnected ? 'Connected' : 'Not connected'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
