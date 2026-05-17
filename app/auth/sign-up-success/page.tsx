//app/auth/sign-up-success/page.tsx

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Mail } from "lucide-react"

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 pt-15">
      <Link href="/" className="mb-8 inline-flex items-center gap-3">
        <Image
          src="/images/white-logo.png"
          alt="Modern Milk Maid"
          width={300}
          height={300}
          className="h-72 w-72"
        />
      </Link>

      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-sage/10">
          <Mail className="h-8 w-8 text-sage" />
        </div>

        <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
          Check your email
        </h1>
        
        <p className="mt-4 text-muted-foreground">
          We have sent you a confirmation link. Click the link in your email to verify 
          your account and log in.
        </p>

        <div className="mt-8">
          <Button asChild variant="outline" className="bg-transparent">
            <Link href="/auth/login">Back to Sign In</Link>
          </Button>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          {"Didn't receive the email? Check your spam folder or "}
          <Link href="/auth/sign-up" className="text-sage hover:underline">
            try again
          </Link>
        </p>
      </div>
    </div>
  )
}
