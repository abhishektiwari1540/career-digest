import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Resend } from "resend";
import { supabase } from "./supabase.js";
import { config } from "../config.js";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "career_digest_master_secret_2026_abhishek";
const resendClient = config.resend.apiKey ? new Resend(config.resend.apiKey) : null;

export interface SystemUser {
  id: string;
  email: string;
  password_hash: string;
  role: "projectadmin" | "instance_owner" | "user";
  full_name: string;
  is_root_owner: boolean;
  is_active: boolean;
  created_at: string;
}

export interface AccessRequest {
  id: string;
  requester_email: string;
  machine_id: string;
  ip_address: string;
  country: string;
  city: string;
  device_os: string;
  status: "pending" | "approved" | "rejected";
  assigned_license_key?: string;
  rejection_reason?: string;
  created_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
}

export interface RegisteredInstance {
  id: string;
  license_key: string;
  owner_email: string;
  machine_id: string;
  city: string;
  country: string;
  last_ip: string;
  last_heartbeat: string;
  is_revoked: boolean;
  revocation_reason?: string;
  created_at: string;
}

export interface GlobalChatLog {
  id: string;
  instance_id?: string;
  user_email: string;
  session_id: string;
  preset_mode: string;
  prompt_text: string;
  assistant_response?: string;
  truth_score?: number;
  ip_address?: string;
  city?: string;
  country?: string;
  created_at: string;
}

export interface GlobalSearchLog {
  id: string;
  instance_id?: string;
  user_email: string;
  search_type: string;
  search_query: string;
  category_filter: string;
  results_count: number;
  top_match_title?: string;
  city?: string;
  country?: string;
  created_at: string;
}

// In-Memory Fallback Stores for offline/resilient zero-downtime execution
const memoryUsers = new Map<string, SystemUser>();
const memoryAccessRequests = new Map<string, AccessRequest>();
const memoryInstances = new Map<string, RegisteredInstance>();
const memoryChatLogs: GlobalChatLog[] = [];
const memorySearchLogs: GlobalSearchLog[] = [];
export const memoryResetCodes = new Map<string, { email: string; code: string; expiresAt: number }>();

/**
 * Initialize Security Engine: Seed Root Admin (Abhishek Tiwari)
 */
export async function initSecurityEngine() {
  const rootEmail = "abhishektiwari1540@gmail.com";
  const defaultPassword = "12345678";
  const salt = bcrypt.genSaltSync(12);
  const passwordHash = bcrypt.hashSync(defaultPassword, salt);

  const rootUser: SystemUser = {
    id: "usr_root_abhishektiwari",
    email: rootEmail,
    password_hash: passwordHash,
    role: "projectadmin",
    full_name: "Abhishek Tiwari (Owner)",
    is_root_owner: true,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  memoryUsers.set(rootEmail, rootUser);

  try {
    const { error } = await supabase.from("system_users").upsert(
      {
        email: rootEmail,
        password_hash: passwordHash,
        role: "projectadmin",
        full_name: "Abhishek Tiwari",
        is_root_owner: true,
        is_active: true,
      },
      { onConflict: "email" }
    );
    if (!error) {
      console.log(`[security] Root projectadmin (${rootEmail}) verified in Supabase.`);
    }
  } catch (err: any) {
    console.warn("[security] system_users table not yet migrated, using in-memory auth store:", err.message);
  }
}

/**
 * Authenticate User with Email and Password
 */
export async function loginUser(email: string, passwordPlain: string): Promise<{
  success: boolean;
  token?: string;
  user?: Partial<SystemUser>;
  error?: string;
}> {
  if (memoryUsers.size === 0) {
    await initSecurityEngine();
  }

  const normalizedEmail = (email || "").trim().toLowerCase();
  if (!normalizedEmail || !passwordPlain) {
    return { success: false, error: "Email and password are required" };
  }

  let user: SystemUser | null = null;

  // Check Supabase first
  try {
    const { data, error } = await supabase
      .from("system_users")
      .select("*")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (!error && data) {
      user = data as SystemUser;
    }
  } catch {
    // Fallback to in-memory
  }

  if (!user) {
    user = memoryUsers.get(normalizedEmail) || null;
  }

  if (!user) {
    return { success: false, error: "Invalid email or password" };
  }

  if (!user.is_active) {
    return { success: false, error: "Account has been suspended or revoked by the project owner." };
  }

  const isMatch = bcrypt.compareSync(passwordPlain, user.password_hash);
  if (!isMatch) {
    return { success: false, error: "Invalid email or password" };
  }

  // Generate signed JWT token valid for 30 days
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    is_root_owner: user.is_root_owner,
    full_name: user.full_name,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });

  return {
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      is_root_owner: user.is_root_owner,
    },
  };
}

/**
 * Verify JWT Auth Token
 */
export function verifyAuthToken(token: string): { valid: boolean; user?: any; error?: string } {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userObj = {
      ...decoded,
      id: decoded.sub || decoded.id || (decoded.email === "abhishektiwari1540@gmail.com" ? "usr_root_abhishektiwari" : undefined),
    };
    return { valid: true, user: userObj };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

/**
 * Request Password Reset: Generates a 6-digit verification code and emails it via Resend
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string; debugCode?: string }> {
  const normalizedEmail = (email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return { success: false, message: "Email address is required." };
  }

  if (memoryUsers.size === 0) {
    await initSecurityEngine();
  }

  let userExists = memoryUsers.has(normalizedEmail);
  if (!userExists) {
    try {
      const { data } = await supabase.from("system_users").select("id").eq("email", normalizedEmail).maybeSingle();
      if (data) userExists = true;
    } catch {}
  }

  if (!userExists) {
    return { success: false, message: "No registered account found with this email address." };
  }

  // Generate 6-digit numeric verification code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

  memoryResetCodes.set(normalizedEmail, {
    email: normalizedEmail,
    code,
    expiresAt,
  });

  // Dispatch email via Resend
  if (resendClient && config.resend.apiKey) {
    try {
      await resendClient.emails.send({
        from: config.resend.fromEmail || "no-reply@career-digest.online",
        to: normalizedEmail,
        subject: "🔑 Career-Digest Password Reset Verification Code",
        html: `
          <div style="font-family:sans-serif; background:#0f172a; color:#fff; padding:2rem; border-radius:10px; max-width:600px; margin:auto;">
            <h2 style="color:#38bdf8; margin-top:0;">Password Reset Request</h2>
            <p>You requested a password reset for your <strong>Career-Digest</strong> account.</p>
            <div style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); padding:1rem; border-radius:8px; margin:1.5rem 0; text-align:center;">
              <div style="font-size:0.8rem; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-bottom:0.4rem;">Your 6-Digit Verification Code</div>
              <div style="font-size:2.2rem; font-weight:800; color:#34d399; letter-spacing:4px; font-family:monospace;">${code}</div>
              <div style="font-size:0.75rem; color:#f59e0b; margin-top:0.4rem;">⏱️ Valid for 15 minutes</div>
            </div>
            <p style="font-size:0.85rem; color:#94a3b8;">Enter this 6-digit code in the Career-Digest password reset window to set your new password.</p>
            <hr style="border:none; border-top:1px solid rgba(255,255,255,0.1); margin:1.5rem 0;" />
            <p style="font-size:0.75rem; color:#64748b;">Project Owner: Abhishek Tiwari · Jaipur, India · abhishektiwari1540@gmail.com</p>
          </div>
        `,
      });
      console.log(`[security] Password reset code dispatched via Resend to ${normalizedEmail}`);
    } catch (mailErr: any) {
      console.warn("[security] Email dispatch notice for password reset:", mailErr.message);
    }
  }

  const isLocalDev = !config.resend.apiKey || config.resend.apiKey.includes("placeholder");

  return {
    success: true,
    message: `Verification code sent to ${normalizedEmail}! Please check your email inbox.`,
    debugCode: isLocalDev ? code : undefined,
  };
}

/**
 * Confirm Password Reset: Verifies 6-digit code and applies new bcrypt password hash
 */
export async function confirmPasswordReset(
  email: string,
  resetCode: string,
  newPasswordPlain: string
): Promise<{ success: boolean; message: string }> {
  const normalizedEmail = (email || "").trim().toLowerCase();
  const code = (resetCode || "").trim();
  const newPass = (newPasswordPlain || "").trim();

  if (!normalizedEmail || !code || !newPass) {
    return { success: false, message: "Email, 6-digit verification code, and new password are required." };
  }

  if (newPass.length < 6) {
    return { success: false, message: "New password must be at least 6 characters long." };
  }

  const record = memoryResetCodes.get(normalizedEmail);
  if (!record || record.code !== code) {
    return { success: false, message: "Invalid or expired verification code." };
  }

  if (Date.now() > record.expiresAt) {
    memoryResetCodes.delete(normalizedEmail);
    return { success: false, message: "Verification code has expired. Please request a new code." };
  }

  const salt = bcrypt.genSaltSync(12);
  const passwordHash = bcrypt.hashSync(newPass, salt);

  // Update in memory
  const memUser = memoryUsers.get(normalizedEmail);
  if (memUser) {
    memUser.password_hash = passwordHash;
    memoryUsers.set(normalizedEmail, memUser);
  }

  // Update in Supabase
  try {
    await supabase.from("system_users").update({
      password_hash: passwordHash,
      updated_at: new Date().toISOString(),
    }).eq("email", normalizedEmail);
  } catch (err: any) {
    console.warn("[security] Supabase password update notice:", err.message);
  }

  // Clear code once used
  memoryResetCodes.delete(normalizedEmail);

  return {
    success: true,
    message: "Password reset successfully! You can now log in with your new password.",
  };
}

/**
 * Change Password (Authenticated User)
 */
export async function changePassword(
  email: string,
  currentPasswordPlain: string,
  newPasswordPlain: string
): Promise<{ success: boolean; message: string }> {
  const loginRes = await loginUser(email, currentPasswordPlain);
  if (!loginRes.success) {
    return { success: false, message: "Incorrect current password." };
  }

  if (!newPasswordPlain || newPasswordPlain.length < 6) {
    return { success: false, message: "New password must be at least 6 characters long." };
  }

  const salt = bcrypt.genSaltSync(12);
  const passwordHash = bcrypt.hashSync(newPasswordPlain, salt);

  const normalizedEmail = email.trim().toLowerCase();
  const memUser = memoryUsers.get(normalizedEmail);
  if (memUser) {
    memUser.password_hash = passwordHash;
    memoryUsers.set(normalizedEmail, memUser);
  }

  try {
    await supabase.from("system_users").update({
      password_hash: passwordHash,
      updated_at: new Date().toISOString(),
    }).eq("email", normalizedEmail);
  } catch {}

  return {
    success: true,
    message: "Password updated successfully!",
  };
}

/**
 * Known temporary / burner / disposable email domains blocklist
 */
export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "yopmail.com", "yopmail.fr", "yopmail.net", "cool.fr.nf", "jetable.fr.nf", "courriel.fr.nf", "moncourrier.fr.nf",
  "mailinator.com", "mailinator2.com", "mailinater.com", "suremail.info", "spamherelots.com",
  "tempmail.com", "temp-mail.org", "temp-mail.io", "tempail.com", "tempm.com", "tempmail.net",
  "10minutemail.com", "10minutemail.net", "10minutemail.org", "10minmail.com", "10minutemail.co.uk",
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com", "sharklasers.com", "grr.la", "pokemail.net",
  "trashmail.com", "trashmail.net", "trashmail.me", "trash-mail.com",
  "dispostable.com", "getairmail.com", "mohmal.com", "fakeinbox.com", "throwawaymail.com",
  "nada.ltd", "inboxkitten.com", "crazymailing.com", "tempinbox.com", "mytemp.email",
  "burnermail.io", "emailondeck.com", "generator.email", "disposablemail.com", "dropmail.me",
  "fakemailgenerator.com", "luxusmail.org", "bouncr.com", "maildrop.cc", "mailnull.com",
  "mintemail.com", "mytrashmail.com", "spambox.us", "spamgourmet.com", "tempemail.net",
  "zillamail.com", "mailcatch.com", "yomail.info", "temporarymail.com", "trashymail.com",
  "maildrop.cf", "mohmal.in", "inboxbear.com", "mailsac.com", "harakirimail.com", "getnada.com"
]);

/**
 * Checks whether an email address is from a temporary / disposable email service
 */
export function isDisposableEmail(email: string): { isDisposable: boolean; domain?: string; reason?: string } {
  if (!email || !email.includes("@")) {
    return { isDisposable: false };
  }
  const parts = email.split("@");
  if (parts.length !== 2) return { isDisposable: false };
  const domain = parts[1].toLowerCase().trim();

  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return {
      isDisposable: true,
      domain,
      reason: `The domain "@${domain}" is a known disposable/temporary email provider.`
    };
  }

  // Regex check for subdomains or variations containing disposable keywords
  const patterns = [
    /yopmail/i,
    /mailinator/i,
    /temp[-_.]?mail/i,
    /dispos/i,
    /trash[-_.]?mail/i,
    /guerrilla/i,
    /10minute/i,
    /fake/i,
    /burner/i,
    /throwaway/i,
    /sharklasers/i
  ];

  for (const pat of patterns) {
    if (pat.test(domain)) {
      return {
        isDisposable: true,
        domain,
        reason: `The domain "@${domain}" matches temporary email provider patterns.`
      };
    }
  }

  return { isDisposable: false, domain };
}

export interface ActivationOtpRecord {
  email: string;
  code: string;
  machineId: string;
  ipAddress?: string;
  country?: string;
  city?: string;
  deviceOs?: string;
  expiresAt: number;
}

const memoryActivationOtpCodes = new Map<string, ActivationOtpRecord>();

/**
 * Request Activation OTP: Validates real email (rejects temp mail) and dispatches 6-digit OTP code
 */
export async function requestActivationOtp(data: {
  requesterEmail: string;
  machineId: string;
  ipAddress?: string;
  country?: string;
  city?: string;
  deviceOs?: string;
}): Promise<{ success: boolean; message: string; debugCode?: string }> {
  const normalizedEmail = (data.requesterEmail || "").trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { success: false, message: "A valid email address is required." };
  }

  // 1. Strict Disposable & Fake Email Filter
  const check = isDisposableEmail(normalizedEmail);
  if (check.isDisposable) {
    return {
      success: false,
      message: `Disposable and temporary email addresses (@${check.domain}) are strictly prohibited. Please provide your real, genuine work or personal email address (e.g. Gmail, Outlook, Yahoo, or corporate domain).`,
    };
  }

  // 2. Generate 6-Digit Verification Code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  memoryActivationOtpCodes.set(normalizedEmail, {
    email: normalizedEmail,
    code,
    machineId: data.machineId || "unknown_machine",
    ipAddress: data.ipAddress || "127.0.0.1",
    country: data.country || "Global",
    city: data.city || "Local",
    deviceOs: data.deviceOs || process.platform || "unknown_os",
    expiresAt,
  });

  // 3. Dispatch OTP Email to User via Resend
  if (resendClient && config.resend.apiKey) {
    try {
      await resendClient.emails.send({
        from: config.resend.fromEmail || "no-reply@career-digest.online",
        to: normalizedEmail,
        subject: "🔐 Career-Digest Email Verification OTP Code",
        html: `
          <div style="font-family:sans-serif; background:#0f172a; color:#fff; padding:2rem; border-radius:12px; max-width:600px; margin:auto;">
            <h2 style="color:#38bdf8; margin-top:0;">Verify Your Email Address</h2>
            <p>You requested access to an instance of <strong>Career-Digest</strong>.</p>
            <div style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); padding:1.25rem; border-radius:10px; margin:1.5rem 0; text-align:center;">
              <div style="font-size:0.8rem; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-bottom:0.4rem;">Your 6-Digit Email Verification Code</div>
              <div style="font-size:2.4rem; font-weight:800; color:#34d399; letter-spacing:6px; font-family:monospace;">${code}</div>
              <div style="font-size:0.75rem; color:#f59e0b; margin-top:0.5rem;">⏱️ Valid for 10 minutes</div>
            </div>
            <p style="font-size:0.85rem; color:#94a3b8; line-height:1.5;">Enter this verification code on your screen to verify your email. Once verified, your auto-generated secure password and license key will be emailed to this address.</p>
            <hr style="border:none; border-top:1px solid rgba(255,255,255,0.1); margin:1.5rem 0;" />
            <p style="font-size:0.75rem; color:#64748b;">Project Owner: Abhishek Tiwari · Jaipur, India · abhishektiwari1540@gmail.com</p>
          </div>
        `,
      });
      console.log(`[security] Activation OTP code dispatched via Resend to ${normalizedEmail}`);
    } catch (mailErr: any) {
      console.warn("[security] Email dispatch notice for activation OTP:", mailErr.message);
    }
  }

  const isLocalDev = !config.resend.apiKey || config.resend.apiKey.includes("placeholder");

  return {
    success: true,
    message: `Verification code sent to ${normalizedEmail}! Please check your email inbox to verify.`,
    debugCode: (isLocalDev || process.env.NODE_ENV === "test") ? code : undefined,
  };
}

/**
 * Verify Activation OTP & Auto-Generate Credentials for Real Verified User
 */
export async function verifyActivationOtpAndGenerateCredentials(
  email: string,
  otpCode: string
): Promise<{ success: boolean; message: string; email?: string }> {
  const normalizedEmail = (email || "").trim().toLowerCase();
  const cleanCode = (otpCode || "").trim();

  if (!normalizedEmail || !cleanCode) {
    return { success: false, message: "Email and 6-digit OTP code are required." };
  }

  const stored = memoryActivationOtpCodes.get(normalizedEmail);
  if (!stored) {
    return { success: false, message: "No verification request found for this email, or code has expired. Please request a new code." };
  }

  if (Date.now() > stored.expiresAt) {
    memoryActivationOtpCodes.delete(normalizedEmail);
    return { success: false, message: "Verification code has expired. Please request a new code." };
  }

  if (stored.code !== cleanCode) {
    return { success: false, message: "Invalid verification code. Please check and try again." };
  }

  // OTP is Verified! Remove OTP from cache
  memoryActivationOtpCodes.delete(normalizedEmail);

  // 1. Generate High-Entropy Random Password
  const randomChars = crypto.randomBytes(6).toString("base64").replace(/[+/=]/g, "k");
  const generatedPassword = `cd_${randomChars}!2026`;
  const salt = bcrypt.genSaltSync(12);
  const passwordHash = bcrypt.hashSync(generatedPassword, salt);

  // 2. Generate Unique License Key
  const licenseKey = `CD-LIC-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

  // 3. Create or update user
  const newUser: SystemUser = {
    id: `usr_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    email: normalizedEmail,
    password_hash: passwordHash,
    role: "instance_owner",
    full_name: `Verified Cloner (${stored.city || "Global"})`,
    is_root_owner: false,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  memoryUsers.set(normalizedEmail, newUser);

  // 4. Register instance
  const newInstance: RegisteredInstance = {
    id: `inst_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    license_key: licenseKey,
    owner_email: normalizedEmail,
    machine_id: stored.machineId,
    city: stored.city || "Local",
    country: stored.country || "Global",
    last_ip: stored.ipAddress || "127.0.0.1",
    last_heartbeat: new Date().toISOString(),
    is_revoked: false,
    created_at: new Date().toISOString(),
  };

  memoryInstances.set(licenseKey, newInstance);

  // 5. Record approved access request
  const reqId = `req_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const accessReq: AccessRequest = {
    id: reqId,
    requester_email: normalizedEmail,
    machine_id: stored.machineId,
    ip_address: stored.ipAddress || "127.0.0.1",
    country: stored.country || "Global",
    city: stored.city || "Local",
    device_os: stored.deviceOs || process.platform || "unknown_os",
    status: "approved",
    assigned_license_key: licenseKey,
    created_at: new Date().toISOString(),
    reviewed_at: new Date().toISOString(),
    reviewed_by: "email_otp_verified",
  };
  memoryAccessRequests.set(reqId, accessReq);

  // Persist to Supabase
  try {
    await supabase.from("system_users").upsert({
      email: newUser.email,
      password_hash: newUser.password_hash,
      role: newUser.role,
      full_name: newUser.full_name,
      is_root_owner: false,
      is_active: true,
    }, { onConflict: "email" });

    await supabase.from("registered_instances").insert({
      license_key: newInstance.license_key,
      owner_email: newInstance.owner_email,
      machine_id: newInstance.machine_id,
      city: newInstance.city,
      country: newInstance.country,
      last_ip: newInstance.last_ip,
      is_revoked: false,
    });

    await supabase.from("access_requests").insert({
      id: reqId,
      requester_email: accessReq.requester_email,
      machine_id: accessReq.machine_id,
      ip_address: accessReq.ip_address,
      country: accessReq.country,
      city: accessReq.city,
      device_os: accessReq.device_os,
      status: "approved",
      assigned_license_key: licenseKey,
      reviewed_at: accessReq.reviewed_at,
    });
  } catch (err: any) {
    console.warn("[security] auto-approval persist notice:", err.message);
  }

  // 6. Send automated credentials email to user via Resend
  if (resendClient && config.resend.apiKey) {
    try {
      await resendClient.emails.send({
        from: config.resend.fromEmail || "no-reply@career-digest.online",
        to: normalizedEmail,
        subject: "🎉 Your Career-Digest Login Credentials & License Key",
        html: `
          <div style="font-family:sans-serif; background:#0f172a; color:#fff; padding:2rem; border-radius:12px; max-width:600px; margin:auto;">
            <h2 style="color:#38bdf8; margin-top:0;">Email Verified & Instance Activated</h2>
            <p>Your real email has been verified. Here are your credentials to log in to <strong>Career-Digest</strong>:</p>
            
            <div style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); padding:1.25rem; border-radius:10px; margin:1.5rem 0;">
              <p style="margin:0 0 0.65rem 0;"><strong>Login Email:</strong> <code style="color:#34d399; font-size:1.05rem;">${normalizedEmail}</code></p>
              <p style="margin:0 0 0.65rem 0;"><strong>Generated Password:</strong> <code style="color:#fbbf24; font-size:1.2rem; font-weight:bold;">${generatedPassword}</code></p>
              <p style="margin:0;"><strong>License Key:</strong> <code style="color:#a5b4fc;">${licenseKey}</code></p>
            </div>

            <p style="font-size:0.85rem; color:#94a3b8; line-height:1.5;">You can now return to the login screen and sign in with this password. All your upcoming memories, websites, reading logs, and AI chat copilot sessions will be isolated to your account.</p>
            <hr style="border:none; border-top:1px solid rgba(255,255,255,0.1); margin:1.5rem 0;" />
            <p style="font-size:0.75rem; color:#64748b;">Project Owner: Abhishek Tiwari · Jaipur, India · abhishektiwari1540@gmail.com</p>
          </div>
        `,
      });
      console.log(`[security] Credentials email dispatched via Resend to ${normalizedEmail}`);

      // Also notify Abhishek Tiwari
      await resendClient.emails.send({
        from: config.resend.fromEmail || "no-reply@career-digest.online",
        to: "abhishektiwari1540@gmail.com",
        subject: `🔔 Verified Node Activation: ${normalizedEmail} (${stored.city || "Local"}, ${stored.country || "India"})`,
        html: `
          <div style="font-family:sans-serif; background:#0f172a; color:#fff; padding:1.5rem; border-radius:10px;">
            <h3 style="color:#34d399; margin-top:0;">New Verified Instance Registered</h3>
            <p>A new real user has verified their email via OTP and activated their node:</p>
            <ul>
              <li><strong>Email:</strong> ${normalizedEmail}</li>
              <li><strong>Location:</strong> ${stored.city || "Unknown"}, ${stored.country || "Global"}</li>
              <li><strong>IP:</strong> ${stored.ipAddress || "Unknown"}</li>
              <li><strong>Machine ID:</strong> ${stored.machineId}</li>
              <li><strong>License:</strong> ${licenseKey}</li>
            </ul>
          </div>
        `,
      }).catch(() => {});
    } catch (mailErr: any) {
      console.warn("[security] Email dispatch notice:", mailErr.message);
    }
  }

  return {
    success: true,
    message: "Email verified successfully! Your auto-generated password and license key have been dispatched to your email address.",
    email: normalizedEmail,
  };
}

/**
 * Submit First-Run Access / Activation Request from a Cloned Instance
 */
export async function submitAccessRequest(data: {
  requesterEmail: string;
  machineId: string;
  ipAddress?: string;
  country?: string;
  city?: string;
  deviceOs?: string;
}): Promise<{ success: boolean; requestId?: string; message: string }> {
  const email = (data.requesterEmail || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { success: false, message: "Valid email address is required" };
  }

  // Disposable check
  const check = isDisposableEmail(email);
  if (check.isDisposable) {
    return {
      success: false,
      message: `Disposable and temporary email addresses (@${check.domain}) are strictly prohibited. Please provide a genuine, verifiable email address.`,
    };
  }

  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const record: AccessRequest = {
    id: requestId,
    requester_email: email,
    machine_id: data.machineId || "unknown_machine",
    ip_address: data.ipAddress || "127.0.0.1",
    country: data.country || "Global",
    city: data.city || "Local",
    device_os: data.deviceOs || process.platform || "unknown_os",
    status: "pending",
    created_at: new Date().toISOString(),
  };

  memoryAccessRequests.set(requestId, record);

  try {
    await supabase.from("access_requests").insert({
      id: requestId,
      requester_email: record.requester_email,
      machine_id: record.machine_id,
      ip_address: record.ip_address,
      country: record.country,
      city: record.city,
      device_os: record.device_os,
      status: "pending",
    });
  } catch (err: any) {
    console.warn("[security] access_requests insert notice (using in-memory):", err.message);
  }

  return {
    success: true,
    requestId,
    message: "Activation request received! The project owner (Abhishek Tiwari) has been notified. You will receive an email with your credentials upon verification.",
  };
}

/**
 * List Access Requests (Projectadmin Only)
 */
export async function getAccessRequests(adminEmail: string): Promise<AccessRequest[]> {
  if (adminEmail !== "abhishektiwari1540@gmail.com") {
    const user = memoryUsers.get(adminEmail);
    if (!user || user.role !== "projectadmin") {
      throw new Error("Unauthorized: Projectadmin role required.");
    }
  }

  try {
    const { data, error } = await supabase
      .from("access_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && data) {
      return data as AccessRequest[];
    }
  } catch {
    // fallback
  }

  return Array.from(memoryAccessRequests.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Approve Access Request, Generate Random Password & License, and Dispatch Email
 */
export async function approveAccessRequest(
  requestId: string,
  adminEmail: string
): Promise<{ success: boolean; generatedPassword?: string; licenseKey?: string; message: string }> {
  if (adminEmail !== "abhishektiwari1540@gmail.com") {
    const user = memoryUsers.get(adminEmail);
    if (!user || user.role !== "projectadmin") {
      throw new Error("Unauthorized: Projectadmin role required.");
    }
  }

  let request = memoryAccessRequests.get(requestId);
  if (!request) {
    try {
      const { data } = await supabase.from("access_requests").select("*").eq("id", requestId).single();
      if (data) request = data as AccessRequest;
    } catch {}
  }

  if (!request) {
    return { success: false, message: "Request not found" };
  }

  // 1. Generate High-Entropy Random Password (e.g. cd_8Xq#m9L2)
  const randomChars = crypto.randomBytes(6).toString("base64").replace(/[+/=]/g, "k");
  const generatedPassword = `cd_${randomChars}!2026`;
  const salt = bcrypt.genSaltSync(12);
  const passwordHash = bcrypt.hashSync(generatedPassword, salt);

  // 2. Generate Unique License Key
  const licenseKey = `CD-LIC-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

  // 3. Create or update user
  const newUser: SystemUser = {
    id: `usr_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    email: request.requester_email,
    password_hash: passwordHash,
    role: "instance_owner",
    full_name: `Cloner (${request.city || "Global"})`,
    is_root_owner: false,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  memoryUsers.set(request.requester_email, newUser);

  // 4. Register instance
  const newInstance: RegisteredInstance = {
    id: `inst_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    license_key: licenseKey,
    owner_email: request.requester_email,
    machine_id: request.machine_id,
    city: request.city,
    country: request.country,
    last_ip: request.ip_address,
    last_heartbeat: new Date().toISOString(),
    is_revoked: false,
    created_at: new Date().toISOString(),
  };

  memoryInstances.set(licenseKey, newInstance);

  // Update request status
  request.status = "approved";
  request.assigned_license_key = licenseKey;
  request.reviewed_at = new Date().toISOString();
  request.reviewed_by = adminEmail;
  memoryAccessRequests.set(requestId, request);

  // Persist to Supabase
  try {
    await supabase.from("system_users").upsert({
      email: newUser.email,
      password_hash: newUser.password_hash,
      role: newUser.role,
      full_name: newUser.full_name,
      is_root_owner: false,
      is_active: true,
    }, { onConflict: "email" });

    await supabase.from("registered_instances").insert({
      license_key: newInstance.license_key,
      owner_email: newInstance.owner_email,
      machine_id: newInstance.machine_id,
      city: newInstance.city,
      country: newInstance.country,
      last_ip: newInstance.last_ip,
      is_revoked: false,
    });

    await supabase.from("access_requests").update({
      status: "approved",
      assigned_license_key: licenseKey,
      reviewed_at: new Date().toISOString(),
    }).eq("id", requestId);
  } catch (err: any) {
    console.warn("[security] approval persist notice:", err.message);
  }

  // 5. Send automated credentials email to cloner via Resend
  if (resendClient && config.resend.apiKey) {
    try {
      await resendClient.emails.send({
        from: config.resend.fromEmail || "no-reply@career-digest.online",
        to: request.requester_email,
        subject: "🎉 Your Career-Digest Instance Has Been Activated by Abhishek Tiwari",
        html: `
          <div style="font-family:sans-serif; background:#0f172a; color:#fff; padding:2rem; border-radius:10px; max-width:600px; margin:auto;">
            <h2 style="color:#38bdf8; margin-top:0;">Career-Digest Activation Confirmed</h2>
            <p>Hello,</p>
            <p>Your access request to run a local instance of <strong>Career-Digest</strong> has been approved by project owner <strong>Abhishek Tiwari</strong>.</p>
            
            <div style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); padding:1rem; border-radius:8px; margin:1.5rem 0;">
              <p style="margin:0 0 0.5rem 0;"><strong>Login Email:</strong> <code style="color:#34d399;">${request.requester_email}</code></p>
              <p style="margin:0 0 0.5rem 0;"><strong>Generated Password:</strong> <code style="color:#fbbf24; font-size:1.1rem; font-weight:bold;">${generatedPassword}</code></p>
              <p style="margin:0;"><strong>License Key:</strong> <code style="color:#a5b4fc;">${licenseKey}</code></p>
            </div>

            <p style="font-size:0.85rem; color:#94a3b8;">You may now return to your local instance at <code>http://localhost:3005</code> and log in to unlock the full AI Copilot, Open-Source Diagnostic Hub, and Second Brain dashboard.</p>
            <hr style="border:none; border-top:1px solid rgba(255,255,255,0.1); margin:1.5rem 0;" />
            <p style="font-size:0.75rem; color:#64748b;">Project Owner: Abhishek Tiwari · Jaipur, India · abhishektiwari1540@gmail.com</p>
          </div>
        `,
      });
      console.log(`[security] Activation email dispatched via Resend to ${request.requester_email}`);
    } catch (mailErr: any) {
      console.warn("[security] Email dispatch notice:", mailErr.message);
    }
  }

  return {
    success: true,
    generatedPassword,
    licenseKey,
    message: `Approved ${request.requester_email}! Password generated and activation email dispatched.`,
  };
}

/**
 * Reject Access Request
 */
export async function rejectAccessRequest(requestId: string, reason: string, adminEmail: string) {
  if (adminEmail !== "abhishektiwari1540@gmail.com") {
    throw new Error("Unauthorized");
  }

  const req = memoryAccessRequests.get(requestId);
  if (req) {
    req.status = "rejected";
    req.rejection_reason = reason || "Declined by administrator";
  }

  try {
    await supabase.from("access_requests").update({
      status: "rejected",
      rejection_reason: reason || "Declined by administrator",
      reviewed_at: new Date().toISOString(),
    }).eq("id", requestId);
  } catch {}

  return { success: true };
}

/**
 * Revoke Node Instance (Remote Kill-Switch)
 */
export async function revokeInstance(instanceIdOrKey: string, reason: string, adminEmail: string) {
  if (adminEmail !== "abhishektiwari1540@gmail.com") {
    throw new Error("Unauthorized");
  }

  // Update memory
  for (const [key, inst] of memoryInstances.entries()) {
    if (inst.id === instanceIdOrKey || inst.license_key === instanceIdOrKey) {
      inst.is_revoked = true;
      inst.revocation_reason = reason || "Revoked by project owner";
    }
  }

  try {
    await supabase.from("registered_instances").update({
      is_revoked: true,
      revocation_reason: reason || "Revoked by project owner",
    }).or(`id.eq.${instanceIdOrKey},license_key.eq.${instanceIdOrKey}`);
  } catch {}

  return { success: true, message: `Instance ${instanceIdOrKey} has been revoked.` };
}

/**
 * Log Global Search Telemetry
 */
export async function logGlobalSearch(data: {
  instanceId?: string;
  instance_id?: string;
  userEmail?: string;
  user_email?: string;
  searchQuery?: string;
  search_query?: string;
  searchType?: string;
  search_type?: string;
  categoryFilter?: string;
  category_filter?: string;
  resultsCount?: number;
  results_count?: number;
  topMatchTitle?: string;
  top_match_title?: string;
  city?: string;
  country?: string;
}) {
  const log: GlobalSearchLog = {
    id: `srch_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    instance_id: data.instanceId || data.instance_id,
    user_email: (data.userEmail || data.user_email || "anonymous_cloner").trim().toLowerCase(),
    search_type: data.searchType || data.search_type || "open_source_vector",
    search_query: data.searchQuery || data.search_query || "",
    category_filter: data.categoryFilter || data.category_filter || "all",
    results_count: data.resultsCount ?? data.results_count ?? 0,
    top_match_title: data.topMatchTitle || data.top_match_title || "",
    city: data.city || "Unknown",
    country: data.country || "Global",
    created_at: new Date().toISOString(),
  };

  memorySearchLogs.unshift(log);
  if (memorySearchLogs.length > 500) memorySearchLogs.pop();

  try {
    await supabase.from("global_search_logs").insert({
      user_email: log.user_email,
      search_type: log.search_type,
      search_query: log.search_query,
      category_filter: log.category_filter,
      results_count: log.results_count,
      top_match_title: log.top_match_title,
      city: log.city,
      country: log.country,
    });
  } catch {}
}

/**
 * Log Global Chat & Prompt Telemetry
 */
export async function logGlobalChat(data: {
  instanceId?: string;
  instance_id?: string;
  userEmail?: string;
  user_email?: string;
  sessionId?: string;
  session_id?: string;
  presetMode?: string;
  preset_mode?: string;
  promptText?: string;
  prompt_text?: string;
  assistantResponse?: string;
  assistant_response?: string;
  truthScore?: number;
  truth_score?: number;
  city?: string;
  country?: string;
  ipAddress?: string;
  ip_address?: string;
}) {
  const log: GlobalChatLog = {
    id: `chat_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    instance_id: data.instanceId || data.instance_id,
    user_email: (data.userEmail || data.user_email || "anonymous_cloner").trim().toLowerCase(),
    session_id: data.sessionId || data.session_id || "default_session",
    preset_mode: data.presetMode || data.preset_mode || "deep_planner",
    prompt_text: data.promptText || data.prompt_text || "",
    assistant_response: (data.assistantResponse || data.assistant_response || "").slice(0, 1000),
    truth_score: data.truthScore ?? data.truth_score ?? 95,
    city: data.city || "Unknown",
    country: data.country || "Global",
    ip_address: data.ipAddress || data.ip_address,
    created_at: new Date().toISOString(),
  };

  memoryChatLogs.unshift(log);
  if (memoryChatLogs.length > 500) memoryChatLogs.pop();

  try {
    await supabase.from("global_chat_logs").insert({
      user_email: log.user_email,
      session_id: log.session_id,
      preset_mode: log.preset_mode,
      prompt_text: log.prompt_text,
      assistant_response: log.assistant_response,
      truth_score: log.truth_score,
      city: log.city,
      country: log.country,
      ip_address: log.ip_address,
    });
  } catch {}
}

/**
 * Get Comprehensive Admin Telemetry Dashboard (For Abhishek Tiwari)
 */
export async function getAdminTelemetryDashboard(adminEmail: string) {
  if (adminEmail !== "abhishektiwari1540@gmail.com") {
    const user = memoryUsers.get(adminEmail);
    if (!user || user.role !== "projectadmin") {
      throw new Error("Unauthorized: Projectadmin role required.");
    }
  }

  let instances: RegisteredInstance[] = [];
  let chatLogs: GlobalChatLog[] = [];
  let searchLogs: GlobalSearchLog[] = [];
  let requests: AccessRequest[] = [];

  try {
    const [instRes, chatRes, srchRes, reqRes] = await Promise.all([
      supabase.from("registered_instances").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("global_chat_logs").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("global_search_logs").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("access_requests").select("*").order("created_at", { ascending: false }).limit(50),
    ]);

    if (!instRes.error && instRes.data) instances = instRes.data;
    if (!chatRes.error && chatRes.data) chatLogs = chatRes.data;
    if (!srchRes.error && srchRes.data) searchLogs = srchRes.data;
    if (!reqRes.error && reqRes.data) requests = reqRes.data;
  } catch {}

  // Merge Supabase logs and in-memory fallback logs deduplicated by id
  const combinedInstances = [...instances, ...Array.from(memoryInstances.values())];
  const instMap = new Map<string, RegisteredInstance>();
  combinedInstances.forEach((i) => { if (!instMap.has(i.id)) instMap.set(i.id, i); });
  instances = Array.from(instMap.values());

  const combinedChats = [...chatLogs, ...memoryChatLogs];
  const chatMap = new Map<string, GlobalChatLog>();
  combinedChats.forEach((c) => { if (!chatMap.has(c.id)) chatMap.set(c.id, c); });
  chatLogs = Array.from(chatMap.values()).slice(0, 50);

  const combinedSearches = [...searchLogs, ...memorySearchLogs];
  const searchMap = new Map<string, GlobalSearchLog>();
  combinedSearches.forEach((s) => { if (!searchMap.has(s.id)) searchMap.set(s.id, s); });
  searchLogs = Array.from(searchMap.values()).slice(0, 50);

  const combinedRequests = [...requests, ...Array.from(memoryAccessRequests.values())];
  const reqMap = new Map<string, AccessRequest>();
  combinedRequests.forEach((r) => { if (!reqMap.has(r.id)) reqMap.set(r.id, r); });
  requests = Array.from(reqMap.values());

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const activeNodesCount = instances.filter((i) => !i.is_revoked).length;
  const revokedNodesCount = instances.filter((i) => i.is_revoked).length;

  return {
    success: true,
    stats: {
      totalInstances: instances.length,
      activeNodesCount,
      revokedNodesCount,
      pendingRequestsCount: pendingRequests.length,
      totalChatInteractions: chatLogs.length,
      totalSearchQueries: searchLogs.length,
    },
    instances,
    pendingRequests,
    recentChatLogs: chatLogs,
    recentSearchLogs: searchLogs,
  };
}
