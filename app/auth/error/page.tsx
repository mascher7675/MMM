//app/auth/error/page.tsx

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <Link href="/" className="mb-8 inline-flex items-center gap-3">
        <Image
          src="/images/image2.png"
          alt="Modern Milk Maid"
          width={50}
          height={50}
          className="h-12 w-12"
        />
      </Link>

      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>

        <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
          Something went wrong
        </h1>
        
        <p className="mt-4 text-muted-foreground">
          We encountered an error while processing your request. 
          Please try again or contact us if the problem persists.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="bg-foreground text-background hover:bg-foreground/90">
            <Link href="/auth/login">Try Again</Link>
          </Button>
          <Button asChild variant="outline" className="bg-transparent">
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
