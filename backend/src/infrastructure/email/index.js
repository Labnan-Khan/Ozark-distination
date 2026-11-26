import nodemailer from 'nodemailer';
import { env } from '../../config/environment.js';
import { logger } from '../logging/index.js';

class ConsoleEmailProvider {
  async send(message) {
    logger.info({ to: message.to, subject: message.subject }, 'email (console provider)');
    return { accepted: [message.to] };
  }
}

class SmtpEmailProvider {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
    });
  }

  async send(message) {
    return this.transporter.sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
  }
}

export const emailProvider = env.EMAIL_PROVIDER === 'smtp' ? new SmtpEmailProvider() : new ConsoleEmailProvider();

export const emailTemplates = {
  welcome: ({ fullName }) => ({
    subject: 'Welcome to our property rental platform',
    text: `Hi ${fullName}, your account has been created.`
  }),
  passwordReset: ({ resetUrl }) => ({
    subject: 'Reset your password',
    text: `Use this link to reset your password: ${resetUrl}`,
    html: `<p>Use this link to reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`
  }),
  bookingRequested: ({ reference }) => ({
    subject: `New booking request ${reference}`,
    text: `A new booking request ${reference} is awaiting your review.`
  }),
  bookingConfirmed: ({ reference }) => ({
    subject: `Booking ${reference} confirmed`,
    text: `Your booking ${reference} has been confirmed.`
  }),
  bookingRejected: ({ reference }) => ({
    subject: `Booking ${reference} rejected`,
    text: `Your booking ${reference} was rejected.`
  }),
  cancellationRequested: ({ reference }) => ({
    subject: `Cancellation requested for ${reference}`,
    text: `A cancellation was requested for booking ${reference}.`
  }),
  bookingCancelled: ({ reference }) => ({
    subject: `Booking ${reference} cancelled`,
    text: `Booking ${reference} has been cancelled.`
  }),
  bookingReminder: ({ reference, title, checkIn }) => ({
    subject: `Upcoming booking ${reference}`,
    text: `Reminder: your booking ${reference}${title ? ` at ${title}` : ''}${checkIn ? ` starts on ${checkIn}` : ''} is coming up.`
  }),
  propertyApproved: ({ title }) => ({
    subject: `Property approved: ${title}`,
    text: `Your property "${title}" has been approved.`
  }),
  propertyRejected: ({ title, reason }) => ({
    subject: `Property rejected: ${title}`,
    text: `Your property "${title}" was rejected. Reason: ${reason || 'Not provided'}`
  }),
  propertyLifecycleRequested: ({ title, action, reason }) => ({
    subject: `Property ${action || 'lifecycle'} request received: ${title}`,
    text: `Your ${action || 'lifecycle'} request for "${title}" was received. Reason: ${reason || 'Not provided'}`
  }),
  propertyLifecycleResolved: ({ title, status, action, reason }) => ({
    subject: `Property ${action || 'lifecycle'} request ${status || 'resolved'}: ${title}`,
    text: `Your ${action || 'lifecycle'} request for "${title}" is ${status || 'resolved'}.${reason ? ` Reason: ${reason}` : ''}`
  }),
  propertyDeleted: ({ title, reason }) => ({
    subject: `Property deleted: ${title}`,
    text: `Your property "${title}" was deleted.${reason ? ` Reason: ${reason}` : ''}`
  }),
  accountDeletion: ({ status }) => ({
    subject: 'Account deletion request update',
    text: `Your account deletion request is now ${status}.`
  }),
  generic: ({ subject, text }) => ({ subject: subject || 'Notification', text: text || '' })
};

export function renderEmail(templateName, data) {
  const template = emailTemplates[templateName] || emailTemplates.generic;
  return template(data);
}
