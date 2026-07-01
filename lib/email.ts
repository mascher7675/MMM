//lib/email.ts

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a YYYY-MM-DD string as "Friday, July 4th" */
function formatDeliveryDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" })
  const month = date.toLocaleDateString("en-US", { month: "long" })
  const day = date.getDate()
  const suffix =
    day % 10 === 1 && day !== 11 ? "st" :
    day % 10 === 2 && day !== 12 ? "nd" :
    day % 10 === 3 && day !== 13 ? "rd" : "th"
  return `${weekday}, ${month} ${day}${suffix}`
}

// ---------------------------------------------------------------------------
// Order Confirmation Email
// ---------------------------------------------------------------------------

export interface OrderEmailData {
  customerEmail: string
  customerName: string
  orderId: string
  orderDate: string
  isSubscription: boolean
  deliveryDate: string       // YYYY-MM-DD
  deliveryDay?: string       // "thursday" | "friday" — for subscription copy
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
    price: number            // in cents
  }>
  subtotal: number           // in cents
  total: number              // in cents
}

export async function sendOrderConfirmationEmail(data: OrderEmailData) {
  const formattedDeliveryDate = formatDeliveryDate(data.deliveryDate)
  const deliveryDayLabel = data.deliveryDay
    ? data.deliveryDay.charAt(0).toUpperCase() + data.deliveryDay.slice(1)
    : "Friday"

  const subject = data.isSubscription
    ? `Your weekly subscription is confirmed — Modern Milk Maid`
    : `Order confirmed — Modern Milk Maid`

  const bannerBg = data.isSubscription ? "#5A81A5" : "#85B972"
  const bannerText = data.isSubscription
    ? "✓ &nbsp;Your weekly subscription is confirmed"
    : "✓ &nbsp;Your order is confirmed"

  const bodyIntro = data.isSubscription
    ? `Your weekly subscription is set up. Fresh milk will be delivered to your door every week — starting ${formattedDeliveryDate}.`
    : `Your order is in. We'll have it fresh and ready for your delivery day.`

  const deliveryDateLabel = data.isSubscription ? "First Delivery" : "Delivery Date"

  const deliveryDateValue = data.isSubscription
    ? `${formattedDeliveryDate}<br><span style="font-size:13px;color:#888;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">then every ${deliveryDayLabel}</span>`
    : formattedDeliveryDate

  const orderSectionLabel = data.isSubscription ? "Weekly Delivery" : "Your Order"

  const itemRows = data.items.map(item => `
    <div style="display:table-row;">
      <div style="display:table-cell;padding:14px 0;border-top:1px solid #EDE8DF;font-family:Georgia,serif;font-size:15px;color:#2C3E2D;">
        ${item.name} &nbsp;<span style="color:#888;font-size:14px;">× ${item.quantity}</span>
      </div>
      <div style="display:table-cell;padding:14px 0;border-top:1px solid #EDE8DF;font-family:Georgia,serif;font-size:15px;color:#2C3E2D;text-align:right;">
        $${(item.price / 100).toFixed(2)}
      </div>
    </div>
  `).join("")

  const totalLabel = data.isSubscription ? "Weekly Total" : "Total"
  const totalValue = data.isSubscription
    ? `$${(data.total / 100).toFixed(2)}<span style="font-size:13px;font-weight:normal;color:#888;">/wk</span>`
    : `$${(data.total / 100).toFixed(2)}`

  const subscriptionNote = data.isSubscription ? `
    <div style="margin-top:28px;padding:20px 24px;background:#eef3f8;border-left:3px solid #5A81A5;border-radius:0 4px 4px 0;">
      <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#3a5a7a;line-height:1.6;margin:0;">
        You can skip a delivery, change your milk, or manage your subscription anytime from your
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://modernmilkmaid.com'}/account" style="color:#5A81A5;text-decoration:underline;">account page</a>.
        Skips must be requested by Wednesday at 5 PM for Thursday deliveries, or Thursday at 5 PM for Friday deliveries.
      </p>
    </div>
  ` : ""

  const receiptBlock = data.receiptUrl ? `
    <div style="margin-top:36px;padding:24px;background:#F0EBE2;border-radius:4px;text-align:center;">
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#666;margin-bottom:14px;">Need a copy of your payment receipt?</div>
      <a href="${data.receiptUrl}" style="display:inline-block;padding:12px 28px;background:#2C3E2D;color:#FAF7F2;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.5px;border-radius:3px;">View Payment Receipt</a>
    </div>
  ` : ""

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#e8e3db;">
        <div style="max-width:600px;margin:0 auto;background:#FAF7F2;border-radius:4px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <div style="background:#2C3E2D;padding:44px 48px 36px;text-align:center;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:4px;color:#85B972;text-transform:uppercase;margin-bottom:12px;">North Fork, Long Island</div>
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:normal;color:#FAF7F2;letter-spacing:1px;line-height:1.1;">Modern Milk Maid</div>
            <div style="margin-top:16px;display:inline-block;width:40px;height:1px;background:#85B972;vertical-align:middle;"></div>
            <span style="font-family:Georgia,serif;font-size:18px;color:#85B972;margin:0 12px;">&#10023;</span>
            <div style="display:inline-block;width:40px;height:1px;background:#85B972;vertical-align:middle;"></div>
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;color:#a8bfab;letter-spacing:2px;text-transform:uppercase;margin-top:14px;">Fresh Plant-Based Milks</div>
          </div>

          <!-- Banner -->
          <div style="background:${bannerBg};padding:16px 48px;text-align:center;">
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;color:#ffffff;letter-spacing:0.5px;">${bannerText}</span>
          </div>

          <!-- Body -->
          <div style="padding:44px 48px;">

            <p style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#2C3E2D;margin:0 0 8px;">Hi ${data.customerName},</p>
            <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;color:#5a5a4e;line-height:1.7;margin:0 0 36px;">${bodyIntro}</p>

            <!-- Delivery info -->
            <div style="display:table;width:100%;border-collapse:separate;margin-bottom:36px;">
              <div style="display:table-row;">
                <div style="display:table-cell;width:50%;padding:20px 20px 20px 0;vertical-align:top;border-top:2px solid #2C3E2D;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5A81A5;margin-bottom:8px;">Delivery Address</div>
                  <div style="font-family:Georgia,serif;font-size:15px;color:#2C3E2D;line-height:1.6;">
                    ${data.deliveryAddress.address}<br>
                    ${data.deliveryAddress.city}, ${data.deliveryAddress.state} ${data.deliveryAddress.zip}
                  </div>
                </div>
                <div style="display:table-cell;width:50%;padding:20px 0 20px 24px;vertical-align:top;border-top:2px solid #2C3E2D;border-left:1px solid #EDE8DF;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5A81A5;margin-bottom:8px;">${deliveryDateLabel}</div>
                  <div style="font-family:Georgia,serif;font-size:15px;color:#2C3E2D;line-height:1.4;">${deliveryDateValue}</div>
                </div>
              </div>
            </div>

            <!-- Items -->
            <div style="margin-bottom:8px;">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5A81A5;margin-bottom:16px;">${orderSectionLabel}</div>
              <div style="display:table;width:100%;border-collapse:collapse;">
                ${itemRows}
                <div style="display:table-row;">
                  <div style="display:table-cell;padding:18px 0 0;border-top:2px solid #2C3E2D;font-family:Georgia,serif;font-size:16px;font-weight:bold;color:#2C3E2D;">${totalLabel}</div>
                  <div style="display:table-cell;padding:18px 0 0;border-top:2px solid #2C3E2D;font-family:Georgia,serif;font-size:18px;font-weight:bold;color:#2C3E2D;text-align:right;">${totalValue}</div>
                </div>
              </div>
            </div>

            ${subscriptionNote}
            ${receiptBlock}

            <!-- Sign-off -->
            <div style="margin-top:44px;padding-top:32px;border-top:1px solid #EDE8DF;">
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;color:#5a5a4e;line-height:1.7;margin:0;">Any questions? Just reply here — we're always happy to help.</p>
            </div>

          </div>

          <!-- Footer -->
          <div style="background:#2C3E2D;padding:28px 48px;text-align:center;">
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#85B972;">Modern Milk Maid &nbsp;·&nbsp; North Fork, Long Island, NY</div>
          </div>

        </div>
      </body>
    </html>
  `

  try {
    const { data: emailData, error } = await resend.emails.send({
      from: 'Modern Milk Maid <onboarding@resend.dev>',
      to: [data.customerEmail],
      subject,
      html,
    })

    if (error) {
      console.error('Error sending order confirmation email:', error)
      return { success: false, error }
    }

    return { success: true, data: emailData }
  } catch (error) {
    console.error('Error sending order confirmation email:', error)
    return { success: false, error }
  }
}

// ---------------------------------------------------------------------------
// Refund / Cancellation Request — Confirmation Email (to customer)
// ---------------------------------------------------------------------------

export interface RefundRequestConfirmationData {
  customerEmail: string
  customerName: string
  orderCode: string
  totalCents: number
  deliveryDateLabel: string   // already-formatted, e.g. "Friday, July 3"
  itemsSummary: string        // e.g. "Oat Milk - 16oz × 1"
  customerNote?: string
}

export async function sendRefundRequestConfirmationEmail(data: RefundRequestConfirmationData) {
  const totalStr = `$${(data.totalCents / 100).toFixed(2)}`

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#e8e3db;">
        <div style="max-width:600px;margin:0 auto;background:#FAF7F2;border-radius:4px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <div style="background:#2C3E2D;padding:44px 48px 36px;text-align:center;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:4px;color:#85B972;text-transform:uppercase;margin-bottom:12px;">North Fork, Long Island</div>
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:normal;color:#FAF7F2;letter-spacing:1px;line-height:1.1;">Modern Milk Maid</div>
            <div style="margin-top:16px;display:inline-block;width:40px;height:1px;background:#85B972;vertical-align:middle;"></div>
            <span style="font-family:Georgia,serif;font-size:18px;color:#85B972;margin:0 12px;">&#10023;</span>
            <div style="display:inline-block;width:40px;height:1px;background:#85B972;vertical-align:middle;"></div>
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;color:#a8bfab;letter-spacing:2px;text-transform:uppercase;margin-top:14px;">Fresh Plant-Based Milks</div>
          </div>

          <!-- Banner -->
          <div style="background:#C9A15A;padding:16px 48px;text-align:center;">
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;color:#ffffff;letter-spacing:0.5px;">&#128337; &nbsp;We received your request</span>
          </div>

          <!-- Body -->
          <div style="padding:44px 48px;">

            <p style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#2C3E2D;margin:0 0 8px;">Hi ${data.customerName},</p>
            <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;color:#5a5a4e;line-height:1.7;margin:0 0 36px;">
              We got your cancellation / refund request for order #${data.orderCode}. We'll review it and process it shortly — you'll get a separate email once your refund has been issued.
            </p>

            <!-- Order info -->
            <div style="display:table;width:100%;border-collapse:separate;margin-bottom:36px;">
              <div style="display:table-row;">
                <div style="display:table-cell;width:50%;padding:20px 20px 20px 0;vertical-align:top;border-top:2px solid #2C3E2D;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5A81A5;margin-bottom:8px;">Order</div>
                  <div style="font-family:Georgia,serif;font-size:15px;color:#2C3E2D;line-height:1.6;">
                    #${data.orderCode}<br>
                    ${data.itemsSummary}
                  </div>
                </div>
                <div style="display:table-cell;width:50%;padding:20px 0 20px 24px;vertical-align:top;border-top:2px solid #2C3E2D;border-left:1px solid #EDE8DF;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5A81A5;margin-bottom:8px;">Delivery Date</div>
                  <div style="font-family:Georgia,serif;font-size:15px;color:#2C3E2D;line-height:1.4;">${data.deliveryDateLabel}</div>
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5A81A5;margin:14px 0 4px;">Amount</div>
                  <div style="font-family:Georgia,serif;font-size:15px;color:#2C3E2D;">${totalStr}</div>
                </div>
              </div>
            </div>

            ${data.customerNote ? `
            <div style="margin-bottom:36px;padding:20px 24px;background:#F0EBE2;border-radius:4px;">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5A81A5;margin-bottom:8px;">Your Note</div>
              <p style="font-family:Georgia,serif;font-size:14px;color:#2C3E2D;line-height:1.6;margin:0;white-space:pre-line;">${data.customerNote}</p>
            </div>
            ` : ""}

            <!-- Sign-off -->
            <div style="margin-top:8px;padding-top:32px;border-top:1px solid #EDE8DF;">
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;color:#5a5a4e;line-height:1.7;margin:0;">Any questions? Just reply here — we're always happy to help.</p>
            </div>

          </div>

          <!-- Footer -->
          <div style="background:#2C3E2D;padding:28px 48px;text-align:center;">
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#85B972;">Modern Milk Maid &nbsp;·&nbsp; North Fork, Long Island, NY</div>
          </div>

        </div>
      </body>
    </html>
  `

  try {
    const { data: emailData, error } = await resend.emails.send({
      from: 'Modern Milk Maid <onboarding@resend.dev>',
      to: [data.customerEmail],
      subject: `We received your request — Order #${data.orderCode}`,
      html,
    })

    if (error) {
      console.error('Error sending refund request confirmation email:', error)
      return { success: false, error }
    }

    return { success: true, data: emailData }
  } catch (error) {
    console.error('Error sending refund request confirmation email:', error)
    return { success: false, error }
  }
}

// ---------------------------------------------------------------------------
// Refund / Cancellation Request — Declined Email (to customer)
// ---------------------------------------------------------------------------

export interface RefundRequestDeclinedData {
  customerEmail: string
  customerName: string
  orderCode: string
  totalCents: number
  deliveryDateLabel: string   // already-formatted, e.g. "Friday, July 3"
  itemsSummary: string        // e.g. "Oat Milk - 16oz × 1"
  reason?: string
}

export async function sendRefundRequestDeclinedEmail(data: RefundRequestDeclinedData) {
  const totalStr = `$${(data.totalCents / 100).toFixed(2)}`

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#e8e3db;">
        <div style="max-width:600px;margin:0 auto;background:#FAF7F2;border-radius:4px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <div style="background:#2C3E2D;padding:44px 48px 36px;text-align:center;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:4px;color:#85B972;text-transform:uppercase;margin-bottom:12px;">North Fork, Long Island</div>
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:normal;color:#FAF7F2;letter-spacing:1px;line-height:1.1;">Modern Milk Maid</div>
            <div style="margin-top:16px;display:inline-block;width:40px;height:1px;background:#85B972;vertical-align:middle;"></div>
            <span style="font-family:Georgia,serif;font-size:18px;color:#85B972;margin:0 12px;">&#10023;</span>
            <div style="display:inline-block;width:40px;height:1px;background:#85B972;vertical-align:middle;"></div>
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;color:#a8bfab;letter-spacing:2px;text-transform:uppercase;margin-top:14px;">Fresh Plant-Based Milks</div>
          </div>

          <!-- Banner -->
          <div style="background:#6b6b63;padding:16px 48px;text-align:center;">
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;color:#ffffff;letter-spacing:0.5px;">An update on your request</span>
          </div>

          <!-- Body -->
          <div style="padding:44px 48px;">

            <p style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#2C3E2D;margin:0 0 8px;">Hi ${data.customerName},</p>
            <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;color:#5a5a4e;line-height:1.7;margin:0 0 36px;">
              We looked into your cancellation / refund request for order #${data.orderCode}, and unfortunately we're not able to process it. Your original order stands as-is — no changes have been made, and no refund has been issued.
            </p>

            <!-- Order info -->
            <div style="display:table;width:100%;border-collapse:separate;margin-bottom:36px;">
              <div style="display:table-row;">
                <div style="display:table-cell;width:50%;padding:20px 20px 20px 0;vertical-align:top;border-top:2px solid #2C3E2D;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5A81A5;margin-bottom:8px;">Order</div>
                  <div style="font-family:Georgia,serif;font-size:15px;color:#2C3E2D;line-height:1.6;">
                    #${data.orderCode}<br>
                    ${data.itemsSummary}
                  </div>
                </div>
                <div style="display:table-cell;width:50%;padding:20px 0 20px 24px;vertical-align:top;border-top:2px solid #2C3E2D;border-left:1px solid #EDE8DF;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5A81A5;margin-bottom:8px;">Delivery Date</div>
                  <div style="font-family:Georgia,serif;font-size:15px;color:#2C3E2D;line-height:1.4;">${data.deliveryDateLabel}</div>
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5A81A5;margin:14px 0 4px;">Amount</div>
                  <div style="font-family:Georgia,serif;font-size:15px;color:#2C3E2D;">${totalStr}</div>
                </div>
              </div>
            </div>

            ${data.reason ? `
            <div style="margin-bottom:36px;padding:20px 24px;background:#F0EBE2;border-radius:4px;">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5A81A5;margin-bottom:8px;">Reason</div>
              <p style="font-family:Georgia,serif;font-size:14px;color:#2C3E2D;line-height:1.6;margin:0;white-space:pre-line;">${data.reason}</p>
            </div>
            ` : ""}

            <!-- Sign-off -->
            <div style="margin-top:8px;padding-top:32px;border-top:1px solid #EDE8DF;">
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;color:#5a5a4e;line-height:1.7;margin:0;">If you think this was a mistake or have questions, just reply here — we're happy to talk it through.</p>
            </div>

          </div>

          <!-- Footer -->
          <div style="background:#2C3E2D;padding:28px 48px;text-align:center;">
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#85B972;">Modern Milk Maid &nbsp;·&nbsp; North Fork, Long Island, NY</div>
          </div>

        </div>
      </body>
    </html>
  `

  try {
    const { data: emailData, error } = await resend.emails.send({
      from: 'Modern Milk Maid <onboarding@resend.dev>',
      to: [data.customerEmail],
      subject: `An update on your request — Order #${data.orderCode}`,
      html,
    })

    if (error) {
      console.error('Error sending refund request declined email:', error)
      return { success: false, error }
    }

    return { success: true, data: emailData }
  } catch (error) {
    console.error('Error sending refund request declined email:', error)
    return { success: false, error }
  }
}

// ---------------------------------------------------------------------------
// Order Cancelled / Refund Issued — Confirmation Email (to customer)
// Sent whenever an admin cancels a one-time order via cancelAndRefundOrder,
// whether or not it started from a formal refund request.
// ---------------------------------------------------------------------------

export interface OrderCancelledEmailData {
  customerEmail: string
  customerName: string
  orderCode: string
  totalCents: number
  deliveryDateLabel: string
  itemsSummary: string
  refunded: boolean
  refundAmountCents?: number | null
}

export async function sendOrderCancelledEmail(data: OrderCancelledEmailData) {
  const totalStr = `$${(data.totalCents / 100).toFixed(2)}`
  const refundStr =
    data.refunded && data.refundAmountCents != null
      ? `$${(data.refundAmountCents / 100).toFixed(2)}`
      : totalStr

  const bannerText = data.refunded
    ? "&#10003; &nbsp;Your refund has been issued"
    : "&#10003; &nbsp;Your order has been cancelled"

  const bodyIntro = data.refunded
    ? `Good news — your refund for order #${data.orderCode} has been processed. ${refundStr} is on its way back to your original payment method. It can take a few business days to show up on your statement, depending on your bank.`
    : `Order #${data.orderCode} has been cancelled as requested. No charge was made to your payment method for this order.`

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#e8e3db;">
        <div style="max-width:600px;margin:0 auto;background:#FAF7F2;border-radius:4px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <div style="background:#2C3E2D;padding:44px 48px 36px;text-align:center;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:4px;color:#85B972;text-transform:uppercase;margin-bottom:12px;">North Fork, Long Island</div>
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:normal;color:#FAF7F2;letter-spacing:1px;line-height:1.1;">Modern Milk Maid</div>
            <div style="margin-top:16px;display:inline-block;width:40px;height:1px;background:#85B972;vertical-align:middle;"></div>
            <span style="font-family:Georgia,serif;font-size:18px;color:#85B972;margin:0 12px;">&#10023;</span>
            <div style="display:inline-block;width:40px;height:1px;background:#85B972;vertical-align:middle;"></div>
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;color:#a8bfab;letter-spacing:2px;text-transform:uppercase;margin-top:14px;">Fresh Plant-Based Milks</div>
          </div>

          <!-- Banner -->
          <div style="background:#5A81A5;padding:16px 48px;text-align:center;">
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;color:#ffffff;letter-spacing:0.5px;">${bannerText}</span>
          </div>

          <!-- Body -->
          <div style="padding:44px 48px;">

            <p style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#2C3E2D;margin:0 0 8px;">Hi ${data.customerName},</p>
            <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;color:#5a5a4e;line-height:1.7;margin:0 0 36px;">${bodyIntro}</p>

            <!-- Order info -->
            <div style="display:table;width:100%;border-collapse:separate;margin-bottom:8px;">
              <div style="display:table-row;">
                <div style="display:table-cell;width:50%;padding:20px 20px 20px 0;vertical-align:top;border-top:2px solid #2C3E2D;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5A81A5;margin-bottom:8px;">Order</div>
                  <div style="font-family:Georgia,serif;font-size:15px;color:#2C3E2D;line-height:1.6;">
                    #${data.orderCode}<br>
                    ${data.itemsSummary}
                  </div>
                </div>
                <div style="display:table-cell;width:50%;padding:20px 0 20px 24px;vertical-align:top;border-top:2px solid #2C3E2D;border-left:1px solid #EDE8DF;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5A81A5;margin-bottom:8px;">Original Delivery Date</div>
                  <div style="font-family:Georgia,serif;font-size:15px;color:#2C3E2D;line-height:1.4;">${data.deliveryDateLabel}</div>
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5A81A5;margin:14px 0 4px;">${data.refunded ? "Refunded" : "Total"}</div>
                  <div style="font-family:Georgia,serif;font-size:15px;color:#2C3E2D;">${refundStr}</div>
                </div>
              </div>
            </div>

            <!-- Sign-off -->
            <div style="margin-top:36px;padding-top:32px;border-top:1px solid #EDE8DF;">
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;color:#5a5a4e;line-height:1.7;margin:0;">Any questions? Just reply here — we're always happy to help.</p>
            </div>

          </div>

          <!-- Footer -->
          <div style="background:#2C3E2D;padding:28px 48px;text-align:center;">
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#85B972;">Modern Milk Maid &nbsp;·&nbsp; North Fork, Long Island, NY</div>
          </div>

        </div>
      </body>
    </html>
  `

  try {
    const { data: emailData, error } = await resend.emails.send({
      from: 'Modern Milk Maid <onboarding@resend.dev>',
      to: [data.customerEmail],
      subject: data.refunded
        ? `Your refund has been issued — Order #${data.orderCode}`
        : `Order cancelled — Order #${data.orderCode}`,
      html,
    })

    if (error) {
      console.error('Error sending order cancelled/refunded email:', error)
      return { success: false, error }
    }

    return { success: true, data: emailData }
  } catch (error) {
    console.error('Error sending order cancelled/refunded email:', error)
    return { success: false, error }
  }
}

// ---------------------------------------------------------------------------
// Contact Notification Email (unchanged)
// ---------------------------------------------------------------------------

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
                border-bottom: 2px solid #85B972;
              }
              .header h1 {
                margin: 0;
                color: #85B972;
                font-size: 24px;
              }
              .content { padding: 24px 0; }
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
              .message-body { white-space: pre-wrap; }
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
              <div class="field"><a href="mailto:${data.email}" style="color:#85B972;">${data.email}</a></div>
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