type UserInfoProps = {
  name: string
  email: string
}

export default function UserInfo({ name, email }: UserInfoProps) {
  return (
    <div className="userInfo">
      <div className="userName">{name}</div>
      <div className="userEmail">{email}</div>
    </div>
  )
}
