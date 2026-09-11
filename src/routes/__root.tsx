import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const APP_NAME = "Keshf";

function RootComponent() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 3000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setSession(session);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setErrorMsg(error.message || "حدث خطأ أثناء إنشاء الحساب.");
      } else {
        setSuccessMsg("تم إنشاء الحساب بنجاح! يمكنك تسجيل الدخول الآن.");
        setIsSignUp(false);
        setPassword("");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErrorMsg("خطأ في الإيميل أو كلمة المرور، تأكد منها يا بطل.");
      }
    }
  };

  const renderAuthOverlay = () => {
    if (session) return null;

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
        <form onSubmit={handleSubmit} style={{ background: '#1e293b', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', width: '350px', textAlign: 'right', fontFamily: 'sans-serif' }} dir="rtl">
          <h2 style={{ color: '#fff', marginBottom: '20px', textAlign: 'center', fontSize: '22px' }}>
            {isSignUp ? "إنشاء حساب جديد" : "تسجيل دخول Keshf"}
          </h2>
          
          {errorMsg && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '13px', textAlign: 'center' }}>{errorMsg}</div>}
          {successMsg && <div style={{ background: '#dcfce7', color: '#166534', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '13px', textAlign: 'center' }}>{successMsg}</div>}

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', color: '#94a3b8', marginBottom: '5px', fontSize: '14px' }}>البريد الإلكتروني</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', boxSizing: 'border-box' }} />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: '#94a3b8', marginBottom: '5px', fontSize: '14px' }}>كلمة المرور</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', boxSizing: 'border-box' }} />
          </div>

          <button type="submit" style={{ width: '100%', background: '#2563eb', color: '#fff', padding: '12px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px' }}>
            {isSignUp ? "إنشاء الحساب" : "دخول"}
          </button>

          <div style={{ textAlign: 'center', marginTop: '15px' }}>
            <button type="button" onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(""); setSuccessMsg(""); }} style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', textDecoration: 'underline', fontSize: '14px' }}>
              {isSignUp ? "لديك حساب بالفعل؟ سجل دخولك" : "ليس لديك حساب؟ أنشئ حساباً جديداً"}
            </button>
          </div>
        </form>
      </div>
    );
  };

  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc', margin: 0 }}>
            <h2 style={{ fontFamily: 'sans-serif', color: '#334155' }}>جاري تحميل النظام...</h2>
          </div>
        ) : (
          <>
            <PreviewHostBridge />
            <AuthProvider>
              <Outlet />
            </AuthProvider>
            {renderAuthOverlay()}
            {session && (
              <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 9999 }}>
                <button onClick={() => supabase.auth.signOut()} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                  تسجيل خروج
                </button>
              </div>
            )}
          </>
        )}
        {/* السكريبت ده هو اللي كان بيعملنا الأزمة لما بيختفي! */}
        <Scripts />
      </body>
    </html>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#5C3D8F" },
      {
        name: "description",
        content: "Keshf composes Saudi bank-statement PDFs from Excel exports, privately in the browser.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        name: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Outfit:wght@300;400;500;600&display=swap",
      },
    ],
  }),
  component: RootComponent,
});