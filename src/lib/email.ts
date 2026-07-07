import { Resend } from 'resend';
import { env } from './env';

// Lazily construct Resend so importing this module never throws at build /
// module-load time. `new Resend(undefined)` throws "Missing API key", which
// previously crashed Next's page-data collection on any route importing this.
let cachedResend: Resend | null = null;

function getResend(): Resend {
  if (!cachedResend) {
    cachedResend = new Resend(env.RESEND_API_KEY);
  }
  return cachedResend;
}

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

    const result = await getResend().emails.send({
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
  `,

  documentationDrift: (name: string, fileName: string, dashboardUrl: string) => `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ef4444, #f87171); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9fafb; }
          .button { display: inline-block; padding: 12px 30px; background: #ef4444; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .info-box { background: #fee2e2; padding: 15px; border-radius: 5px; border-left: 4px solid #ef4444; margin: 20px 0; }
          .footer { background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Documentation Out of Sync ⚠️</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>Our drift detection system noticed that the source code for <strong>${fileName}</strong> was recently updated.</p>
            
            <div class="info-box">
              <p>The existing documentation for this file is now marked as a <strong>DRAFT</strong> because it may no longer accurately reflect the current state of the code.</p>
            </div>
            
            <p>We recommend reviewing the documentation and using the "Regenerate AI" feature to bring it back in sync with your latest changes.</p>
            
            <a href="${dashboardUrl}" class="button">View in Dashboard</a>
            
            <p>Best regards,<br>The DocuMint AI Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2025 DocuMint AI. All rights reserved.</p>
            <p>This is an automated notification from our documentation health system.</p>
          </div>
        </div>
      </body>
    </html>
  `,

  teamHealthReport: (teamName: string, stats: { coverage: number, totalFiles: number, documentedFiles: number, staleCount: number, coverageGoal: number }, dashboardUrl: string) => `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9fafb; }
          .stat-grid { margin: 20px 0; }
          .stat-card { display: inline-block; width: 45%; background: white; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; text-align: center; margin-right: 5px; }
          .stat-value { font-size: 24px; font-weight: bold; color: #4f46e5; }
          .stat-label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
          .progress-container { width: 100%; background: #e5e7eb; height: 10px; border-radius: 5px; margin: 15px 0; }
          .progress-bar { height: 100%; border-radius: 5px; background: #4f46e5; }
          .button { display: inline-block; padding: 12px 30px; background: #4f46e5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Team Health Report 📊</h1>
            <p>${teamName}</p>
          </div>
          <div class="content">
            <h2>Documentation Overview</h2>
            <p>Here's how your team's documentation is holding up against your <strong>${stats.coverageGoal}%</strong> target.</p>
            
            <div class="stat-grid">
              <div class="stat-card">
                <div class="stat-value">${stats.coverage}%</div>
                <div class="stat-label">Coverage</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${stats.staleCount}</div>
                <div class="stat-label">Stale Docs</div>
              </div>
            </div>

            <div class="progress-container">
                <div class="progress-bar" style="width: ${Math.min(stats.coverage, 100)}%;"></div>
            </div>
            
            <p><strong>Detailed Breakdown:</strong></p>
            <ul>
              <li>Goal: ${stats.coverageGoal}%</li>
              <li>Current: ${stats.coverage}%</li>
              <li>Total Project Files: ${stats.totalFiles}</li>
              <li>Documented Files: ${stats.documentedFiles}</li>
              <li>Out of Sync: ${stats.staleCount}</li>
            </ul>
            
            <a href="${dashboardUrl}" class="button">View Team Dashboard</a>
            
            <p>Regularly updating your documentation ensures that your team stays productive and avoids technical debt.</p>
            
            <p>Best regards,<br>The DocuMint AI Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2026 DocuMint AI. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `,

  reviewRequested: (reviewerName: string, requesterName: string, fileName: string, reviewUrl: string) => `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { padding: 30px; background: #f9fafb; }
          .info-box { background: #eef2ff; padding: 15px; border-radius: 5px; border-left: 4px solid #4f46e5; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 30px; background: #4f46e5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Review Requested 🔍</h1>
          </div>
          <div class="content">
            <h2>Hi ${reviewerName},</h2>
            <p><strong>${requesterName}</strong> has requested your review on the documentation for <strong>${fileName}</strong>.</p>
            
            <div class="info-box">
              <p>The documentation is currently in <strong>REVIEW</strong> status and needs your approval or feedback before it can be finalized.</p>
            </div>
            
            <a href="${reviewUrl}" class="button">Review Documentation</a>
            
            <p>Best regards,<br>The DocuMint AI team</p>
          </div>
          <div class="footer">
            <p>&copy; 2026 DocuMint AI. All rights reserved.</p>
            <p>This is an automated notification from your workspace.</p>
          </div>
        </div>
      </body>
    </html>
  `
};
