import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default function RootPage() {
  const session = cookies().get('cf_session')
  if (session?.value === 'authenticated') {
    redirect('/dashboard/sales')
  }
  redirect('/login')
}
