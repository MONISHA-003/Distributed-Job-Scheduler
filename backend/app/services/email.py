import smtplib
from email.message import EmailMessage
import structlog

from app.config import settings

logger = structlog.get_logger()


def send_welcome_email(to_email: str, full_name: str):
    """
    Sends a welcome email to a newly signed-up user.
    Runs inside a FastAPI background task to avoid blocking the main event loop.
    """
    msg = EmailMessage()
    msg["Subject"] = "Welcome to Job Flow! 🚀"
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email

    # Email body (HTML)
    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e5e5; border-radius: 10px; background-color: #fcfcfc;">
          <h2 style="color: #8b5cf6;">Welcome to Job Flow, {full_name}!</h2>
          <p>We are excited to have you on board! Job Flow is a distributed, high-performance job scheduler designed to make managing asynchronous workloads simple and reliable.</p>
          
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4 style="margin-top: 0; color: #111827;">Your Account Details:</h4>
            <p style="margin-bottom: 0;"><strong>Registered Email:</strong> {to_email}</p>
          </div>

          <p>You can now log into your dashboard, create projects, schedule jobs, and monitor your worker nodes in real-time.</p>
          
          <hr style="border: 0; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
          <p style="font-size: 12px; color: #9ca3af; text-align: center;">Sent automatically by the Distributed Job Scheduler System.</p>
        </div>
      </body>
    </html>
    """
    msg.set_content(html_content, subtype="html")

    try:
        logger.info("Connecting to SMTP server", host=settings.SMTP_HOST, port=settings.SMTP_PORT)
        # Connect to Mailhog SMTP (no auth required by default, no TLS)
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            
            server.send_message(msg)
            logger.info("Welcome email sent successfully", recipient=to_email)
    except Exception as e:
        logger.error("Failed to send welcome email", recipient=to_email, error=str(e))
        # We don't raise the error so the API call doesn't fail if SMTP is temporarily down
