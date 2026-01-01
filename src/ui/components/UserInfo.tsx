import { Badge } from './ui/Badge'

type UserInfoProps = {
  name: string
  email: string
  isAdmin?: boolean
}

export default function UserInfo({ name, email, isAdmin }: UserInfoProps) {
  return (
    <div className="userInfo">
      <div className="userName">{name}</div>
      <div className="userEmail">{email}</div>
      {isAdmin ? <Badge tone="info">Admin</Badge> : null}
    </div>
  )
}
