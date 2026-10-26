import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button, Card, FieldLabel, Input } from "../components/ui";
import { OrganizationLogo } from "../components/OrganizationLogo";
import { useApp } from "../context/AppContext";
import { useToast } from "../components/Toast";

const workspaceBenefits = ["Review and approve payment submissions", "Activate attendance tickets after confirmation", "Manage offerings, methods, and event check-in"];

export function AdminLoginPage() {
  const { session, signInAdmin } = useApp();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
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

  return <main className="min-h-screen bg-mist px-4 py-5 text-ink dark:bg-navy-950 sm:px-6 sm:py-8"><div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-6xl items-center"><div className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-float dark:bg-navy-900 lg:grid-cols-[0.92fr_1.08fr]"><section className="relative overflow-hidden bg-navy-900 px-6 py-8 text-white sm:px-10 sm:py-10 lg:px-12 lg:py-12"><div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[38px] border-white/5" /><div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-blue-400/10 blur-2xl" /><div className="relative flex h-full flex-col"><OrganizationLogo surface="dark" /><div className="mt-14 max-w-md lg:mt-24"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200/70">Operations console</p><h1 className="mt-4 text-3xl font-extrabold leading-[1.05] tracking-[-0.05em] sm:text-5xl">Keep every payment and entry point in sync.</h1><p className="mt-6 max-w-sm text-sm leading-7 text-blue-100/70">A focused workspace for the JPCS - LCC team to verify collections, issue tickets, and welcome attendees.</p></div><div className="mt-10 space-y-3 lg:mt-auto lg:pt-20">{workspaceBenefits.map((benefit) => <div key={benefit} className="flex items-center gap-3 text-xs font-semibold text-blue-50"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-300/15 text-emerald-200"><CheckCircle2 className="h-3.5 w-3.5" /></span>{benefit}</div>)}</div><div className="mt-10 border-t border-white/10 pt-5 text-[11px] leading-5 text-blue-100/50">Restricted to configured Supabase administrator accounts.</div></div></section><section className="flex items-center px-6 py-8 sm:px-10 sm:py-12 lg:px-14"><div className="mx-auto w-full max-w-md"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-navy-50 text-navy-700"><ShieldCheck className="h-5 w-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-navy-700">Protected workspace</p><p className="mt-1 text-xs font-semibold text-slate-400">JPCS - LCC payment operations</p></div></div><h2 className="mt-8 text-2xl font-extrabold tracking-[-0.04em] text-navy-900 sm:text-3xl">Welcome back</h2><p className="mt-3 text-sm leading-6 text-slate-500">Sign in with your Supabase admin account to continue.</p><form className="mt-8 space-y-5" onSubmit={openAdmin}><div><FieldLabel required>Email address</FieldLabel><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="admin@example.com" required /></div><div><div className="flex items-center justify-between gap-3"><FieldLabel required>Password</FieldLabel><span className="text-[10px] font-semibold text-slate-400">Supabase Auth</span></div><div className="relative"><Input className="pr-11" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><button type="button" className="absolute right-2 top-1.5 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-navy-900" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>{error ? <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-800" role="alert"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error}</span></div> : null}<Button className="w-full" size="lg" type="submit" loading={loading}>Enter admin workspace <ArrowRight className="h-4 w-4" /></Button></form><Card className="mt-6 border-blue-100 bg-blue-50/70 p-4 shadow-none"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" /><p className="text-[11px] leading-5 text-navy-800">The email must also be listed in the <code className="font-mono font-bold">hs-admins</code> table before access is granted.</p></div></Card><div className="mt-7 flex items-center justify-between gap-3 border-t border-line pt-5 text-xs"><Link className="font-semibold text-slate-500 transition hover:text-navy-900" to="/">Back to public payment form</Link><span className="text-slate-400">JPCS - LCC</span></div></div></section></div></div></main>;
}
