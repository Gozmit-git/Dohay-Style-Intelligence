import { useEffect, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { ArrowRight, Camera, CreditCard, MessageCircle, Shirt, Sparkles, UserRound, LogOut, ShieldCheck } from "lucide-react";
import { Link, Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { ChatPage } from "./pages/chat-page";
import { ProfilePage } from "./pages/profile-page";
import { WardrobePage } from "./pages/wardrobe-page";
import { BillingPage } from "./pages/billing-page";
import { BillingAdminPage } from "./pages/billing-admin-page";
import { OwnerPage } from "./pages/owner-page";
import { useOwnerAccess } from "./hooks/use-owner";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

function Brand() {
  return <Link className="brand-lockup" href="/" aria-label="DOHAY home"><span className="brand-monogram">D</span><span><span className="brand-name">DOHAY</span><span className="brand-caption">Personal styling, remembered</span></span></Link>;
}

function AppShell({ children, currentPage }: { children: ReactNode; currentPage: string }) {
  const owner = useOwnerAccess();
  const { user } = useUser();
  const { signOut } = useClerk();
  const display = user?.firstName || user?.username || user?.primaryEmailAddress?.emailAddress || "Your account";
  const initials = display.slice(0, 1).toUpperCase();
  const navigation = [
    { href: "/", label: "Styling chat", icon: MessageCircle, key: "chat" },
    { href: "/wardrobe", label: "My wardrobe", icon: Shirt, key: "wardrobe" },
    { href: "/profile", label: "Style profile", icon: UserRound, key: "profile" },
    { href: "/billing", label: "Plans", icon: CreditCard, key: "billing" },
    ...(owner.isOwner ? [{ href: "/admin", label: "Owner dashboard", icon: ShieldCheck, key: "admin" }] : []),
  ];
  return <div className="app-frame">
    <aside className="side-rail">
      <Brand />
      <div className="sidebar-purpose"><span>STYLE, WITH CONTEXT</span><strong>Your clothes.<br />Your point of view.</strong></div>
      <div className="nav-caption">Your space</div>
      <nav className="primary-nav" aria-label="Main navigation">{navigation.map(({ href, label, icon: Icon, key }) => <Link key={key} href={href} className={`rail-link ${currentPage === key ? "active" : ""}`}><Icon size={16} strokeWidth={1.7} /><span>{label}</span></Link>)}</nav>
      <div className="sidebar-note"><span className="note-dash" /><p>Good advice starts with what you actually own.</p></div>
      <div className="rail-bottom">
        <Link href="/profile" className="profile-chip"><span className="profile-avatar">{initials}</span><span>{display}</span></Link>
        <button type="button" className="signout-link" onClick={() => void signOut({ redirectUrl: basePath || "/" })}><LogOut size={13} /> Sign out</button>
      </div>
    </aside>
    <main className={`main-stage ${currentPage === "chat" ? "chat-stage" : ""}`}>
      <header className="mobile-header"><Brand /><Link href="/profile" className="mobile-user" aria-label="Your style profile"><span className="profile-avatar">{initials}</span></Link></header>
      {children}
      <nav className="mobile-nav" aria-label="Main navigation">{navigation.map(({ href, label, icon: Icon, key }) => <Link key={key} href={href} className={currentPage === key ? "active" : ""}><Icon size={17} strokeWidth={1.7} /><span>{label}</span></Link>)}</nav>
    </main>
  </div>;
}

function LandingPage() {
  return <main className="landing">
    <nav className="landing-nav"><Brand /><div className="landing-links"><Link className="button button-quiet button-small" href="/sign-in">Sign in</Link><Link className="button button-small" href="/sign-up">Create your account <ArrowRight size={13} /></Link></div></nav>
    <section className="landing-hero">
      <div>
        <span className="eyebrow">Personal styling that remembers your real closet</span>
        <h1 className="landing-title">What should I<br />wear with <em>what I own?</em></h1>
        <p className="page-subtitle landing-lede">Take an outfit selfie and ask, “How do I look?” Get a quick fit check on colours, visible fit, and styling—no wardrobe setup needed.</p>
        <div className="landing-ctas"><Link className="button" href="/sign-up">Get a quick fit check <ArrowRight size={14} /></Link><Link className="button button-quiet" href="/sign-in">I already have an account</Link></div>
        <div className="landing-trust"><span><ShieldMini /> Only your saved pieces</span><span><ShieldMini /> Photo consent is always yours</span></div>
      </div>
      <div className="landing-image" role="img" aria-label="Illustration of a small edited wardrobe on a clothing rail">
        <div className="landing-rack" />
        <div className="landing-garments"><i /><i /><i /><i /></div>
        <div className="landing-image-caption"><span>YOUR WARDROBE, REMEMBERED</span><strong>Dress like yourself.</strong></div>
        <div className="landing-side-label">A STYLIST WHO KNOWS WHAT YOU OWN</div>
      </div>
    </section>
    <section className="landing-principles">
      <div><span className="eyebrow">A different kind of style help</span><h2>Advice that starts with your own hanger.</h2></div>
      <div><p>Most styling starts with a shopping list. DOHAY starts by listening. Tell it where you’re going, capture what you own in Wardrobe, and see ideas made from your saved pieces.</p><div className="landing-principle-list"><span><b>01</b> You set the context</span><span><b>02</b> Your closet sets the limits</span><span><b>03</b> You can edit every detail</span></div></div>
    </section>
    <section className="landing-ritual">
      <span className="eyebrow">A small daily ritual</span>
      <div className="ritual-steps"><article><span>01 — ASK</span><h3>Start with the day.</h3><p>Work, dinner, a long walk. Tell DOHAY what matters today.</p></article><article><span>02 — REMEMBER</span><h3>Keep your real closet.</h3><p>Each detected piece waits for your review. Nothing slips in on its own.</p></article><article><span>03 — REPEAT</span><h3>Wear it your way.</h3><p>Save the combinations that feel like you. Change anything that doesn’t.</p></article></div>
    </section>
    <section className="landing-close"><span className="eyebrow">Less guessing. More getting dressed.</span><h2>Start with the clothes<br />you already love.</h2><Link className="button" href="/sign-up">Meet your personal stylist <ArrowRight size={14} /></Link></section>
    <footer className="landing-footer"><Brand /><span>Private by default. Yours by design.</span></footer>
  </main>;
}

function ShieldMini() {
  return <span className="mini-shield" aria-hidden="true"><Sparkles size={10} /></span>;
}

function SignInPage() {
  return <main className="auth-page"><div className="auth-brand"><Brand /><span className="eyebrow">Your style, remembered</span></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></main>;
}

function SignUpPage() {
  return <main className="auth-page"><div className="auth-brand"><Brand /><span className="eyebrow">A little more you, every morning</span></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></main>;
}

function NotFound() {
  return <main className="not-found"><span className="eyebrow">404 · Not in this closet</span><h1>That page wandered off.</h1><p>Head back to the conversation, and we’ll figure it out together.</p><Link className="button" href="/">Back to DOHAY <ArrowRight size={14} /></Link></main>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const cache = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) cache.clear();
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, cache]);
  return null;
}

function AuthenticatedRoute({ page }: { page: "chat" | "wardrobe" | "profile" | "billing" | "billing-admin" | "admin" }) {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return <main className="auth-loading"><div className="auth-loading-card"><div className="loading-pulse" /><div className="skeleton" /></div></main>;
  if (!user) return <LandingPage />;
  const content = page === "admin" ? <OwnerPage key={user.id} /> : page === "billing-admin"
    ? <BillingAdminPage key={user.id} />
    : page === "billing"
      ? <BillingPage key={user.id} />
      : page === "chat"
    ? <ChatPage key={user.id} />
    : page === "wardrobe"
      ? <WardrobePage key={user.id} />
      : <ProfilePage key={user.id} />;
  return <AppShell currentPage={page === "billing-admin" ? "admin" : page}>{content}</AppShell>;
}

function ClerkAppRoutes() {
  return <>
    <ClerkQueryClientCacheInvalidator />
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/"><AuthenticatedRoute page="chat" /></Route>
      <Route path="/capture"><AuthenticatedRoute page="chat" /></Route>
      <Route path="/wardrobe"><AuthenticatedRoute page="wardrobe" /></Route>
      <Route path="/profile"><AuthenticatedRoute page="profile" /></Route>
      <Route path="/admin"><AuthenticatedRoute page="admin" /></Route>
      <Route path="/billing/admin"><AuthenticatedRoute page="billing-admin" /></Route>
      <Route path="/billing"><AuthenticatedRoute page="billing" /></Route>
      <Route component={NotFound} />
    </Switch>
  </>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: "Welcome back", subtitle: "Return to the clothes you already own." } },
      signUp: { start: { title: "Make it yours", subtitle: "Start a more thoughtful styling conversation." } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <ClerkAppRoutes />
  </ClerkProvider>;
}

function App() {
  if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");
  return <QueryClientProvider client={queryClient}><WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter></QueryClientProvider>;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#385e52",
    colorForeground: "#293b34",
    colorMutedForeground: "#737c72",
    colorDanger: "#a5473f",
    colorBackground: "#fbf8f1",
    colorInput: "#f8f5ed",
    colorInputForeground: "#293b34",
    colorNeutral: "#d8d0c1",
    fontFamily: "DM Sans, sans-serif",
    borderRadius: "1rem",
  },
  elements: {
    rootBox: { width: "100%", display: "flex", justifyContent: "center" },
    cardBox: { width: "440px", maxWidth: "100%", backgroundColor: "#fbf8f1", borderRadius: "22px", overflow: "hidden", boxShadow: "0 16px 40px rgba(59,69,59,.09)" },
    card: { backgroundColor: "transparent", boxShadow: "none", border: "0" },
    footer: { backgroundColor: "transparent", boxShadow: "none", border: "0" },
    headerTitle: { color: "#293b34", fontFamily: "Playfair Display, Georgia, serif", fontWeight: 500 },
    headerSubtitle: { color: "#65736a" },
    socialButtonsBlockButtonText: { color: "#293b34", fontWeight: 600 },
    formFieldLabel: { color: "#293b34", fontWeight: 600 },
    footerActionLink: { color: "#385e52", fontWeight: 600 },
    footerActionText: { color: "#65736a" },
    dividerText: { color: "#65736a" },
    identityPreviewEditButton: { color: "#385e52" },
    formFieldSuccessText: { color: "#385e52" },
    alertText: { color: "#8e3d37" },
    logoBox: { borderRadius: "50%" },
    logoImage: { borderRadius: "50%" },
    socialButtonsBlockButton: { backgroundColor: "#fbf8f1", borderColor: "#d8d0c1", borderRadius: "999px", color: "#293b34" },
    formButtonPrimary: { backgroundColor: "#385e52", color: "#fbf8f1", borderRadius: "999px", boxShadow: "none" },
    formFieldInput: { backgroundColor: "#f8f5ed", color: "#293b34", borderColor: "#d8d0c1", borderRadius: "10px" },
    footerAction: { color: "#65736a" },
    dividerLine: { backgroundColor: "#d8d0c1" },
    alert: { backgroundColor: "#f8eeeb", borderColor: "#ddb3aa", color: "#8e3d37" },
    otpCodeFieldInput: { backgroundColor: "#f8f5ed", color: "#293b34", borderColor: "#d8d0c1" },
    formFieldRow: { color: "#293b34" },
    main: { color: "#293b34" },
  },
};

export default App;
