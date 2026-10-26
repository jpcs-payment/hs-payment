import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button, Card, FieldLabel, Input } from "../components/ui";
import { OrganizationLogo } from "../components/OrganizationLogo";
import { useApp } from "../context/AppContext";
import { useToast } from "../components/Toast";
import { BRANDING } from "../lib/branding";

export function AdminLoginPage() {
  const { session, signInAdmin } = useApp();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("jpcs.payment@gmail.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (session?.role === "admin") return <Navigate to="/admin/payments" replace />;

  const openAdmin = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInAdmin(email, password);
      pushToast({ tone: "success", title: "Admin signed in", message: "The payment workspace is ready." });
      navigate("/admin/payments");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "The admin sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  return <main className="flex min-h-screen items-center justify-center bg-navy-900 px-4 py-10"><div className="w-full max-w-md"><div className="mb-8"><OrganizationLogo surface="dark" /></div><Card className="p-6 sm:p-8"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-50 text-navy-700"><ShieldCheck className="h-6 w-6" /></span><p className="mt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-navy-700">Protected workspace</p><h1 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-navy-900">Admin sign in</h1><p className="mt-3 text-sm leading-6 text-slate-500">Sign in with the Supabase admin account to review payments and manage collection settings.</p><form className="mt-7 space-y-5" onSubmit={openAdmin}><div><FieldLabel>Email</FieldLabel><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></div><div><FieldLabel>Password</FieldLabel><div className="relative"><Input className="pr-11" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><button type="button" className="absolute right-2 top-1.5 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-navy-900" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>{error ? <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-800">{error}</p> : null}<Button className="w-full" size="lg" type="submit" loading={loading}>Sign in <ArrowRight className="h-4 w-4" /></Button></form><div className="mt-5 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] leading-5 text-navy-800"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />Only the configured Supabase admin email can access this workspace.</div></Card><p className="mt-6 text-center text-[11px] text-blue-100/50">{BRANDING.projectName}</p></div></main>;
}
