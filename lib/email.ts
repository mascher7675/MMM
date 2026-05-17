//lib/email.ts

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface OrderEmailData {
  customerEmail: string
  customerName: string
  orderId: string
  orderDate: string
  receiptUrl?: string | null
  deliveryAddress: {
    address: string
    city: string
    state: string
    zip: string
  }
  items: Array<{
    name: string
    quantity: number
    price: number
  }>
  subtotal: number
  total: number
}

export async function sendOrderConfirmationEmail(data: OrderEmailData) {
  try {
    const { data: emailData, error } = await resend.emails.send({
      from: 'Modern Milk Maid <onboarding@resend.dev>',
      to: [data.customerEmail],
      subject: `Order Confirmation - Modern Milk Maid`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                text-align: center;
                padding: 30px 0;
                border-bottom: 2px solid #7C9885;
              }
              .header h1 {
                margin: 0;
                color: #7C9885;
                font-size: 28px;
              }
              .content {
                padding: 30px 0;
              }
              .order-details {
                background: #f9f9f9;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
              }
              .order-details h2 {
                margin-top: 0;
                color: #333;
                font-size: 18px;
              }
              .order-details p {
                margin: 5px 0;
              }
              .items-table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
              }
              .items-table th {
                background: #7C9885;
                color: white;
                padding: 12px;
                text-align: left;
              }
              .items-table td {
                padding: 12px;
                border-bottom: 1px solid #ddd;
              }
              .total-row {
                font-weight: bold;
                font-size: 18px;
              }
              .receipt-btn {
                display: inline-block;
                margin: 8px 0 4px;
                padding: 10px 20px;
                background: #7C9885;
                color: #ffffff !important;
                text-decoration: none;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 600;
                letter-spacing: 0.3px;
              }
              .footer {
                text-align: center;
                padding: 30px 0;
                border-top: 1px solid #ddd;
                color: #666;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Modern Milk Maid</h1>
              <p style="color: #666; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Plant Based Milks</p>
            </div>

            <div class="content">
              <h2 style="color: #7C9885;">Thank You for Your Order!</h2>
              <p>Hi ${data.customerName},</p>
              <p>Your order has been confirmed and will be prepared fresh for delivery.</p>

              <div class="order-details">
                <h2>Order Details</h2>
                <p><strong>Order Number:</strong> ${data.orderId}</p>
                <p><strong>Order Date:</strong> ${data.orderDate}</p>
                ${data.receiptUrl ? `
                <p style="margin-top: 14px;">
                  <a href="${data.receiptUrl}" class="receipt-btn" target="_blank">View Payment Receipt</a>
                </p>
                <p style="font-size: 13px; color: #888; margin-top: 6px;">
                  Your receipt includes card details and payment confirmation from Stripe.
                </p>
                ` : ''}
              </div>

              <div class="order-details">
                <h2>Delivery Address</h2>
                <p>${data.deliveryAddress.address}</p>
                <p>${data.deliveryAddress.city}, ${data.deliveryAddress.state} ${data.deliveryAddress.zip}</p>
              </div>

              <table class="items-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Quantity</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.items.map(item => `
                    <tr>
                      <td>${item.name}</td>
                      <td>${item.quantity}</td>
                      <td>$${(item.price / 100).toFixed(2)}</td>
                    </tr>
                  `).join('')}
                  <tr class="total-row">
                    <td colspan="2">Total</td>
                    <td>$${(data.total / 100).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              <p>We'll be in touch soon with your delivery details. If you have any questions, feel free to reply to this email.</p>
            </div>

            <div class="footer">
              <p>Modern Milk Maid - Fresh Plant-Based Milk Delivery</p>
              <p>North Fork, Long Island, NY</p>
            </div>
          </body>
        </html>
      `,
    })

    if (error) {
      console.error('Error sending email:', error)
      return { success: false, error }
    }

    return { success: true, data: emailData }
  } catch (error) {
    console.error('Error sending email:', error)
    return { success: false, error }
  }
}

interface ContactNotificationData {
  name: string
  email: string
  phone: string
  message: string
}

export async function sendContactNotificationEmail(data: ContactNotificationData) {
  const adminEmail = process.env.ADMIN_EMAIL ?? process.env.CONTACT_EMAIL ?? 'info@modernmilkmaid.com'

  try {
    const { data: emailData, error } = await resend.emails.send({
      from: 'Modern Milk Maid <onboarding@resend.dev>',
      to: [adminEmail],
      replyTo: data.email,
      subject: `New Contact Form Message from ${data.name}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                text-align: center;
                padding: 24px 0;
                border-bottom: 2px solid #7C9885;
              }
              .header h1 {
                margin: 0;
                color: #7C9885;
                font-size: 24px;
              }
              .content {
                padding: 24px 0;
              }
              .label {
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: #888;
                margin-bottom: 2px;
              }
              .field {
                background: #f9f9f9;
                border-radius: 6px;
                padding: 12px 16px;
                margin-bottom: 16px;
                font-size: 15px;
              }
              .message-body {
                white-space: pre-wrap;
              }
              .footer {
                text-align: center;
                padding: 24px 0 0;
                border-top: 1px solid #ddd;
                color: #999;
                font-size: 13px;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Modern Milk Maid</h1>
              <p style="color:#666; font-size:13px; margin:4px 0 0;">New contact form submission</p>
            </div>

            <div class="content">
              <p class="label">Name</p>
              <div class="field">${data.name}</div>

              <p class="label">Email</p>
              <div class="field"><a href="mailto:${data.email}" style="color:#7C9885;">${data.email}</a></div>

              <p class="label">Phone</p>
              <div class="field">${data.phone}</div>

              <p class="label">Message</p>
              <div class="field message-body">${data.message}</div>

              <p style="font-size:13px; color:#666;">
                You can reply directly to this email to respond to ${data.name}.
              </p>
            </div>

            <div class="footer">
              <p>Modern Milk Maid · North Fork, Long Island, NY</p>
            </div>
          </body>
        </html>
      `,
    })

    if (error) {
      console.error('Error sending contact notification email:', error)
      return { success: false, error }
    }

    return { success: true, data: emailData }
  } catch (error) {
    console.error('Error sending contact notification email:', error)
    return { success: false, error }
  }
}