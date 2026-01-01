import { Badge } from './ui/Badge'

type UserInfoProps = {
  name: string
  email: string
  isAdmin?: boolean
}

export default function UserInfo({ name, email, isAdmin }: UserInfoProps) {
  return (
    <div className="userInfo">
      <div className="userSummary">
        <div className="userMenuText">
          <div className="userMenuTitleRow">
            <span className="userName">{name}</span>
            {isAdmin ? (
              <Badge className="userMenuBadge" tone="info">
                Admin
              </Badge>
            ) : null}
          </div>
          <span className="userEmail">{email}</span>
        </div>
      </div>
    </div>
  )
}
