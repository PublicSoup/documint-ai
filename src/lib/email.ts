import { Resend } from 'resend';
import { env } from './env';

const resend = new Resend(env.RESEND_API_KEY);

interface EmailData {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  react?: React.ReactElement | React.ReactNode | null;
}

export async function sendEmail(data: EmailData) {
  try {
    if (!env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not configured, email not sent:', data.subject);
      return { success: true, id: 'demo' }; // Demo mode for development
    }

    const result = await resend.emails.send({
      from: data.from || env.EMAIL_FROM,
      to: data.to,
      subject: data.subject,
      html: data.html,
      replyTo: data.replyTo,
    });

    console.log('Email sent successfully:', result);
    return { success: true, id: result.data?.id || 'demo' };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error };
  }
}

// Email Templates
export const emailTemplates = {
  welcome: (name: string, loginUrl: string) => `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #7c3aed, #8b5cf6); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9fafb; }
          .button { display: inline-block; padding: 12px 30px; background: #7c3aed; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to DocuMint AI! 🎉</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>Welcome to DocuMint AI! We're thrilled to have you join our community of developers who document smarter.</p>
            
            <p>With DocuMint AI, you can:</p>
            <ul>
              <li>Generate comprehensive documentation from your code automatically</li>
              <li>Analyze code quality and security patterns</li>
              <li>Collaborate with your team on documentation</li>
              <li>Export in multiple formats (Markdown, HTML, JSON)</li>
              <li>Generate README files and changelogs</li>
            </ul>
            
            <a href="${loginUrl}" class="button">Get Started</a>
            
            <p>If you have any questions, feel free to reach out to our support team.</p>
            
            <p>Best regards,<br>The DocuMint AI Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2025 DocuMint AI. All rights reserved.</p>
            <p><a href="https://documint.ai">Visit our website</a> | <a href="mailto:support@documint.ai">Contact Support</a></p>
          </div>
        </div>
      </body>
    </html>
  `,

  paymentSuccess: (name: string, invoiceUrl: string, plan: string, amount: string) => `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981, #34d399); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9fafb; }
          .invoice-info { background: white; padding: 20px; border-radius: 5px; border-left: 4px solid #10b981; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; }
          .footer { background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Confirmed! ✅</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>Your payment has been processed successfully. Thank you for choosing DocuMint AI!</p>
            
            <div class="invoice-info">
              <h3>Payment Details</h3>
              <p><strong>Plan:</strong> ${plan} Plan</p>
              <p><strong>Amount:</strong> ${amount}</p>
              <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            
            <p>You now have access to:</p>
            <ul>
              <li>Full documentation generation capabilities</li>
              <li>Advanced code analysis features</li>
              <li>Team collaboration tools</li>
              <li>Priority support</li>
            </ul>
            
            <a href="${invoiceUrl}" class="button">View Invoice</a>
            
            <p>If you have any questions about your subscription, please contact our support team.</p>
          </div>
          <div class="footer">
            <p>&copy; 2025 DocuMint AI. All rights reserved.</p>
            <p>This is an automated email. Please do not reply to this message.</p>
          </div>
        </div>
      </body>
    </html>
  `,

  teamInvite: (inviterName: string, teamName: string, acceptUrl: string) => `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #3b82f6, #60a5fa); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9fafb; }
          .button { display: inline-block; padding: 12px 30px; background: #3b82f6; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Team Invitation 📬</h1>
          </div>
          <div class="content">
            <h2>You've been invited!</h2>
            <p><strong>${inviterName}</strong> has invited you to join the team <strong>${teamName}</strong> on DocuMint AI.</p>
            
            <p>Once you accept, you'll be able to:</p>
            <ul>
              <li>Collaborate on documentation with your team</li>
              <li>Share code analysis insights</li>
              <li>Access team-shared templates and settings</li>
              <li>Work together on code documentation projects</li>
            </ul>
            
            <a href="${acceptUrl}" class="button">Accept Invitation</a>
            
            <p>This invitation will expire in 7 days. If you believe this invitation was sent in error, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; 2025 DocuMint AI. All rights reserved.</p>
            <p>This invitation was sent by ${inviterName}.</p>
          </div>
        </div>
      </body>
    </html>
  `,

  passwordReset: (name: string, resetUrl: string) => `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f59e0b, #fbbf24); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9fafb; }
          .button { display: inline-block; padding: 12px 30px; background: #f59e0b; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .warning { background: #fef3c7; padding: 15px; border-radius: 5px; border-left: 4px solid #f59e0b; margin: 20px 0; }
          .footer { background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Reset Your Password 🔒</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>We received a request to reset your password for your DocuMint AI account.</p>
            
            <div class="warning">
              <p><strong>Important:</strong> This link will expire in 1 hour for security reasons.</p>
            </div>
            
            <a href="${resetUrl}" class="button">Reset Password</a>
            
            <p>If you didn't request this change, you can safely ignore this email. Your password will remain unchanged.</p>
            
            <p>Best regards,<br>The DocuMint AI Security Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2025 DocuMint AI. All rights reserved.</p>
            <p>This is an automated security email.</p>
          </div>
        </div>
      </body>
    </html>
  `
};
