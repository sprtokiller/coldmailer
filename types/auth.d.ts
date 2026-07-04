declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    name: string
    image: string | null
  }
}

export {}
