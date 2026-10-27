import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button, FieldLabel, Input } from "../components/ui";
import { OrganizationLogo } from "../components/OrganizationLogo";
import { useApp } from "../context/AppContext";
import { useToast } from "../components/Toast";
import { BRANDING } from "../lib/branding";

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

  return (
    <main className="min-h-screen bg-mist px-4 py-5 text-ink dark:bg-navy-950 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-6xl items-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-float dark:bg-navy-900 xl:grid-cols-[0.92fr_1.08fr]">
          <section className="relative overflow-hidden bg-navy-900 px-6 py-8 text-white sm:px-10 sm:py-10 xl:px-12 xl:py-12">
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[38px] border-white/5" />
            <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-blue-400/10 blur-2xl" />
            <div className="relative flex h-full flex-col">
              <OrganizationLogo surface="dark" />
              <div className="mt-14 max-w-md xl:mt-24">
                <h1 className="text-3xl font-extrabold leading-[1.05] tracking-[-0.05em] sm:text-5xl">Keep every payment and entry point in sync.</h1>
                <p className="mt-6 max-w-sm text-sm leading-7 text-blue-100/70">A focused workspace for the JPCS - LCC team to verify collections, issue tickets, and welcome attendees.</p>
                <div className="mt-8 space-y-1 text-[10px] font-medium leading-5 text-blue-100/60"><p>{BRANDING.credits[0]}</p><p>{BRANDING.credits[1]}</p></div>
              </div>
            </div>
          </section>
          <section className="flex items-center px-6 py-8 sm:px-10 sm:py-12 xl:px-14">
            <div className="mx-auto w-full max-w-md">
               <h2 className="text-2xl font-extrabold tracking-[-0.04em] text-navy-900 sm:text-3xl">Admin login</h2>
               <form className="mt-8 space-y-5" onSubmit={openAdmin}>
                <div>
                  <FieldLabel required>Email address</FieldLabel>
                  <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="admin@example.com" required />
                </div>
                <div>
                  <FieldLabel required>Password</FieldLabel>
                  <div className="relative">
                    <Input className="pr-11" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
                    <button type="button" className="absolute right-2 top-1.5 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-navy-900" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {error ? <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-800" role="alert"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error}</span></div> : null}
                <Button className="w-full" size="lg" type="submit" loading={loading}>Login</Button>
              </form>
              <div className="mt-7 flex items-center justify-between gap-3 border-t border-line pt-5 text-xs">
                <Link className="font-semibold text-slate-500 transition hover:text-navy-900" to="/">Back to public payment form</Link>
                <span className="text-slate-400">JPCS - LCC</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
