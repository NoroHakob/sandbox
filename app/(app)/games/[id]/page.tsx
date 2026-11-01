import { auth } from "@clerk/nextjs/server"

export default async function Page({ params }: PageProps<"/games/[id]">) {
  await auth.protect({ unauthenticatedUrl: "/sign-in" })

  const { id } = await params

  return <p>{id}</p>
}
