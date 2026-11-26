import { z } from 'zod';
import { emailSchema, passwordSchema, phoneSchema } from '../../shared/validators/index.js';

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema
}).strict();

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128)
}).strict();

export const refreshSchema = z.object({
  refreshToken: z.string().min(10)
}).strict();

export const forgotPasswordSchema = z.object({
  email: emailSchema
}).strict();

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: passwordSchema
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema
}).strict();
