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

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          console.error("Supabase Error:", error.message);
        }
        setSession(session);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Fetch Session Error:", err);
        setLoading(false); // دي أهم حتة عشان الشاشة متفضلش معلقة
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setErrorMsg("خطأ في الإيميل أو كلمة المرور، تأكد منها يا بطل.");
    }
  };

  if (loading) {
    return (
      <html lang="en" className="antialiased" suppressHydrationWarning>
        <head>
          <HeadContent />
        </head>
        <body style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc', margin: 0 }}>
          <h2 style={{ fontFamily: 'sans-serif', color: '#334155' }}>جاري تحميل النظام...</h2>
        </body>
      </html>
    );
  }

  // لو مفيش سيشن، اعرض شاشة الـ Login فقط
  if (!session) {
    return (
      <html lang="en" className="antialiased" suppressHydrationWarning>
        <head>
          <HeadContent />
        </head>
        <body style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a', margin: 0, fontFamily: 'sans-serif' }}>
          <form onSubmit={handleLogin} style={{ background: '#1e293b', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', width: '350px', textAlign: 'right' }} dir="rtl">
            <h2 style={{ color: '#fff', marginBottom: '20px', textAlign: 'center', fontSize: '22px' }}>تسجيل دخول Keshf</h2>
            
            {errorMsg && (
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '13px', textAlign: 'center' }}>
                {errorMsg}
              </div>
            )}

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', color: '#94a3b8', marginBottom: '5px', fontSize: '14px' }}>البريد الإلكتروني</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#94a3b8', marginBottom: '5px', fontSize: '14px' }}>كلمة المرور</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', boxSizing: 'border-box' }}
              />
            </div>

            <button type="submit" style={{ width: '100%', background: '#2563eb', color: '#fff', padding: '12px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px' }}>
              دخول
            </button>
          </form>
        </body>
      </html>
    );
  }

  // لو فيه سيشن، افتح التطبيق بكل ميزاته مع الـ AuthProvider والـ Outlet
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 9999 }}>
          <button 
            onClick={() => supabase.auth.signOut()} 
            style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            تسجيل خروج
          </button>
        </div>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
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
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Outfit:wght@300;400;500;600&display=swap",
      },
    ],
  }),
  component: RootComponent,
});