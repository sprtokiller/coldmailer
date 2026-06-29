declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    name: string
    image: string | null
    isAdmin: boolean
  }
}

export {}
