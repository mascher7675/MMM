//components/account/profile-form.tsx

"use client"

import React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { updateProfile } from "@/app/actions/profile"

interface Profile {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  delivery_instructions: string | null
}

interface ProfileFormProps {
  userId: string
  profile: Profile | null
}

export function ProfileForm({ userId, profile }: ProfileFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    firstName: profile?.first_name || "",
    lastName: profile?.last_name || "",
    phone: profile?.phone || "",
    address: profile?.address || "",
    city: profile?.city || "",
    state: profile?.state || "",
    zip: profile?.zip || "",
    deliveryInstructions: profile?.delivery_instructions || "",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    
    await updateProfile({
      userId,
      firstName: formData.firstName,
      lastName: formData.lastName,
      phone: formData.phone,
      address: formData.address,
      city: formData.city,
      state: formData.state,
      zip: formData.zip,
      deliveryInstructions: formData.deliveryInstructions,
    })
    
    setIsLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name</Label>
          <Input
            id="firstName"
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
            placeholder="Jane"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name</Label>
          <Input
            id="lastName"
            name="lastName"
            value={formData.lastName}
            onChange={handleChange}
            placeholder="Doe"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          value={formData.phone}
          onChange={handleChange}
          placeholder="(631) 555-1234"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Street Address</Label>
        <Input
          id="address"
          name="address"
          value={formData.address}
          onChange={handleChange}
          placeholder="123 Main Street"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            name="city"
            value={formData.city}
            onChange={handleChange}
            placeholder="Greenport"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            name="state"
            value={formData.state}
            onChange={handleChange}
            placeholder="NY"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="zip">ZIP Code</Label>
          <Input
            id="zip"
            name="zip"
            value={formData.zip}
            onChange={handleChange}
            placeholder="11944"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="deliveryInstructions">Delivery Instructions</Label>
        <Textarea
          id="deliveryInstructions"
          name="deliveryInstructions"
          value={formData.deliveryInstructions}
          onChange={handleChange}
          placeholder="Leave by the side door, ring the bell, etc."
          rows={3}
        />
      </div>

      <Button
        type="submit"
        disabled={isLoading}
        className="w-full bg-sage text-sage-foreground hover:bg-sage/90"
      >
        {isLoading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  )
}
