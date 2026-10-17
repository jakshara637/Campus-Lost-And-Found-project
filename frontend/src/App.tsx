
import { useEffect, useMemo, useState } from "react";
import { apiUrl, clearAccessToken, fetchItems, fetchCurrentUser, getAccessToken, saveAccessToken, type ApiItem, type ApiUser } from "./lib/api";
import PortalDialog, { type DialogMode } from "./components/PortalDialog";
import ClaimsDialog, { type ClaimsDialogMode } from "./components/ClaimsDialog";
import MyReportsDialog from "./components/MyReportsDialog";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BarChart3,
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Compass,
  Laptop,
  LogOut,
  MapPin,
  Menu,
  PackageSearch,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import "./App.css";

type ItemType = "Lost" | "Found";

type CampusItem = {
  id: number;
  title: string;
  category: string;
  location: string;
  date: string;
  type: ItemType;
  image: string;
  icon: typeof Laptop;
  description: string;
  status: string;
  postedBy: number;
  posterName: string;
  posterEmail: string;
};

function formatItemDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function mapApiItem(item: ApiItem): CampusItem {
  const category = item.category || "Other";
  const normalizedCategory = category.toLowerCase();
  const icon = normalizedCategory.includes("electronic")
    ? Laptop
    : normalizedCategory.includes("bag")
      ? BookOpen
      : normalizedCategory.includes("accessor")
        ? Wallet
        : normalizedCategory.includes("phone")
          ? Smartphone
          : BookOpen;

  return {
    id: item.id,
    title: item.title,
    category,
    location: item.location,
    date: formatItemDate(item.created_at),
    type: item.item_type === "found" ? "Found" : "Lost",
    image: item.image_path ? apiUrl(item.image_path) : "",
    icon,
    description: item.description,
    status: item.status,
    postedBy: item.posted_by,
    posterName: item.posted_by_name || "Unknown poster",
    posterEmail: item.posted_by_email || "Not provided",
  };
}

const fallbackImage =
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85";

const filters = ["All items", "Lost", "Found"] as const;
type Filter = (typeof filters)[number];

function App() {
  const [activeFilter, setActiveFilter] = useState<Filter>("All items");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [items, setItems] = useState<CampusItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [itemsError, setItemsError] = useState("");
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const [oauthError, setOauthError] = useState("");
  const [reportType, setReportType] = useState<ItemType>("Lost");
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
  const [isCheckingUser, setIsCheckingUser] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [claimsDialogMode, setClaimsDialogMode] = useState<ClaimsDialogMode | null>(null);
  const [myReportsOpen, setMyReportsOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [selectedClaimItem, setSelectedClaimItem] = useState<CampusItem | null>(null);
  const [detailsItem, setDetailsItem] = useState<CampusItem | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadItems() {
      setIsLoadingItems(true);
      setItemsError("");
      try {
        const apiItems = await fetchItems(controller.signal);
        setItems(apiItems.map(mapApiItem));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setItemsError(error instanceof Error ? error.message : "Could not load campus reports.");
      } finally {
        if (!controller.signal.aborted) setIsLoadingItems(false);
      }
    }

    void loadItems();
    return () => controller.abort();
  }, [refreshKey]);

  // Keep report statuses fresh across different students' browser sessions.
  // Without this refresh, the owner can miss the "Review responses" action
  // after another student submits a claim.
  useEffect(() => {
    const refreshReports = () => setRefreshKey((current) => current + 1);
    const intervalId = window.setInterval(refreshReports, 10000);
    window.addEventListener("focus", refreshReports);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshReports);
    };
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;

    const params = new URLSearchParams(hash.slice(1));
    const token = params.get("access_token");
    const authError = params.get("auth_error");
    const authMode = params.get("auth_mode");

    if (token) {
      saveAccessToken(token);
    }

    if (authError) {
      setDialogMode(authMode === "register" ? "register" : "login");
      setOauthError(
        authError === "google_login_failed"
          ? "Google sign-in failed. Please register with your email or try Google sign-in again."
          : authError === "google_register_failed"
            ? "Google registration failed. Please try again or register with your email."
            : authError === "account_not_found"
              ? "No account is registered with this Google email. Please create an account first."
              : authError === "account_exists"
                ? "An account already exists with this Google email. Please log in instead."
                : "Google sign-in could not be completed. Please try again.",
      );
    }

    if (token || authError) {
      // Remove authentication details from the visible URL.
      window.history.replaceState(
        null,
        document.title,
        window.location.pathname + window.location.search,
      );
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (!getAccessToken()) {
      setCurrentUser(null);
      setIsCheckingUser(false);
      return () => { active = false; };
    }
    setIsCheckingUser(true);
    void fetchCurrentUser()
      .then((user) => { if (active) setCurrentUser(user); })
      .catch(() => { if (active) setCurrentUser(null); })
      .finally(() => { if (active) setIsCheckingUser(false); });
    return () => { active = false; };
  }, [refreshKey]);

  const visibleItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return items.filter((item) => {
      const matchesType =
        activeFilter === "All items" || item.type === activeFilter;

      const matchesSearch =
        !query ||
        [item.title, item.category, item.location].some((value) =>
          value.toLowerCase().includes(query),
        );

      return matchesType && matchesSearch;
    });
  }, [items, activeFilter, searchQuery]);

  function scrollToReports() {
    document.getElementById("recent-reports")?.scrollIntoView({
      behavior: "smooth",
    });
    setMobileMenuOpen(false);
  }

  function handleReportClick(type: ItemType) {
    setReportType(type);
    setDialogMode("report");
  }

  function handleViewItemDetails(item: CampusItem) {
    setDetailsItem(item);
  }

  function handleDialogSuccess() {
    setDialogMode(null);
    setRefreshKey((current) => current + 1);
  }

  function openClaimDialog(mode: ClaimsDialogMode, item?: CampusItem) {
    if (!getAccessToken()) {
      setDialogMode("login");
      return;
    }
    setSelectedClaimItem(item ?? null);
    setClaimsDialogMode(mode);
  }

  function handleClaimsSuccess() {
    setRefreshKey((current) => current + 1);
  }

  function handleLogout() {
    // Clear the saved bearer token so protected actions require a fresh login.
    clearAccessToken();
    setCurrentUser(null);
    setProfileMenuOpen(false);
    setMobileMenuOpen(false);
    setClaimsDialogMode(null);
    setSelectedClaimItem(null);
    setDialogMode(null);
  }

  return (
    <div className="site-shell">
      <div className="announcement-bar">
        {/* <Sparkles size={14} aria-hidden="true" />
        <span>A little kindness goes a long way on campus.</span>
        <ArrowUpRight size={14} aria-hidden="true" /> */}
      </div>

      <header className="site-header">
        <a className="brand" href="#home" aria-label="CampusLoop home">
          <span className="brand-mark">
            <Compass size={23} strokeWidth={2.3} />
          </span>
          <span className="brand-copy">
            <strong>campus<span>loop</span></strong>
            <small>LOST & FOUND, RECONNECTED</small>
          </span>
        </a>

        <button
          className="mobile-menu-toggle"
          type="button"
          aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <nav className={`main-nav ${mobileMenuOpen ? "nav-open" : ""}`}>
          <a className="nav-link nav-link-active" href="#home" onClick={() => setMobileMenuOpen(false)}>
            Home
          </a>
          <button className="nav-link" type="button" onClick={scrollToReports}>
            Browse items
          </button>
          <button className="nav-link" type="button" onClick={() => { setAnalyticsOpen(true); setMobileMenuOpen(false); }}>
            <BarChart3 size={16} aria-hidden="true" /> Insights
          </button>
          <a className="nav-link" href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>
            How it works
          </a>
          <a className="nav-link" href="#community" onClick={() => setMobileMenuOpen(false)}>
            Our community
          </a>
          <div className="mobile-nav-actions">
            {currentUser ? (
              <>
                <div className="mobile-account-summary">
                  <span className="account-avatar"><UserRound size={18} /></span>
                  <span><strong>{currentUser.full_name}</strong><small>{currentUser.email}</small></span>
                </div>
                <button className="button button-outline" type="button" onClick={() => { openClaimDialog("mine"); setMobileMenuOpen(false); }}>
                  My claims
                </button>
                <button className="button button-outline" type="button" onClick={() => { setMyReportsOpen(true); setMobileMenuOpen(false); }}>
                  <PackageSearch size={16} /> My reports
                </button>
                <button className="button button-outline" type="button" onClick={() => { setAnalyticsOpen(true); setMobileMenuOpen(false); }}>
                  <BarChart3 size={16} /> Analytics dashboard
                </button>
                <button className="button button-primary" type="button" onClick={handleLogout}>
                  <LogOut size={16} /> Log out
                </button>
              </>
            ) : (
              <>
                <button className="button button-outline" type="button" onClick={() => { setDialogMode("login"); setMobileMenuOpen(false); }}>
                  Log in
                </button>
                <button className="button button-primary" type="button" onClick={() => { setDialogMode("register"); setMobileMenuOpen(false); }}>
                  Get started <ArrowRight size={16} />
                </button>
              </>
            )}
          </div>
        </nav>

        <div className="header-actions">
          {currentUser ? (
            <div className="account-menu-wrap">
              <button
                className={`account-menu-trigger ${profileMenuOpen ? "account-menu-trigger-open" : ""}`}
                type="button"
                aria-expanded={profileMenuOpen}
                aria-haspopup="true"
                onClick={() => setProfileMenuOpen((open) => !open)}
              >
                <span className="account-avatar"><UserRound size={19} /></span>
                <span className="account-trigger-copy">
                  <strong>{currentUser.full_name}</strong>
                  <small><span className="account-online-dot" /> Logged in</small>
                </span>
                <ChevronDown className={profileMenuOpen ? "account-chevron-open" : ""} size={16} />
              </button>
              {profileMenuOpen && (
                <div className="account-dropdown" role="menu">
                  <div className="account-dropdown-heading">
                    <span className="account-avatar account-avatar-large"><UserRound size={22} /></span>
                    <div>
                      <strong>{currentUser.full_name}</strong>
                      <span>{currentUser.email}</span>
                    </div>
                  </div>
                  <div className="account-session-status">
                    <span className="account-online-dot" /> You're signed in to CampusLoop
                  </div>
                  <button className="account-dropdown-action" type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); openClaimDialog("mine"); }}>
                    <ShieldCheck size={17} /> My claims <ArrowRight size={15} />
                  </button>
                  <button className="account-dropdown-action" type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); setMyReportsOpen(true); }}>
                    <PackageSearch size={17} /> My reports <ArrowRight size={15} />
                  </button>
                  <button className="account-dropdown-action account-logout-action" type="button" role="menuitem" onClick={handleLogout}>
                    <LogOut size={17} /> Log out <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <button
                className="button button-quiet"
                type="button"
                onClick={() => setDialogMode("login")}
              >
                {isCheckingUser ? "Checking session…" : "Log in"}
              </button>
              <button
                className="button button-primary header-cta"
                type="button"
                onClick={() => setDialogMode("register")}
              >
                Get started <ArrowUpRight size={16} />
              </button>
            </>
          )}
        </div>
      </header>

      <main>
        <section className="hero-section" id="home">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              YOUR CAMPUS. YOUR COMMUNITY.
            </div>

            <h1>
              Lost something?
              <br />
              <span>Let’s bring it</span>
              <br />
              back together.
            </h1>

            <p className="hero-description">
              From misplaced essentials to unexpected discoveries, help good
              things find their way back to the people who need them.
            </p>

            <div className="hero-actions">
              <button
                className="button button-primary button-large"
                type="button"
                onClick={() => handleReportClick("Lost")}
              >
                <Search size={18} />
                I lost something
                <ArrowUpRight size={17} />
              </button>
              <button
                className="button button-outline button-large"
                type="button"
                onClick={() => handleReportClick("Found")}
              >
                <Camera size={18} />
                I found something
              </button>
            </div>

            <div className="hero-trust">
              <div className="avatar-stack" aria-hidden="true">
                <span className="avatar avatar-one">A</span>
                <span className="avatar avatar-two">R</span>
                <span className="avatar avatar-three">S</span>
                <span className="avatar avatar-four">+</span>
              </div>
              <div>
                <strong>Good people. Good finds.</strong>
                <span>A campus community that cares.</span>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-visual-glow" />
            <div className="visual-label visual-label-top">
              <span className="live-dot" />
              SMALL ACTS, BIG IMPACT
            </div>

            <div className="hero-image-frame">
              <img
                src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=90"
                alt="University students spending time together on campus"
              />
              <div className="hero-image-overlay" />
              <div className="hero-image-caption">
                <span className="caption-icon">
                  <CheckCircle2 size={20} />
                </span>
                <div>
                  <strong>It starts with us.</strong>
                  <span>Making campus feel a little closer.</span>
                </div>
              </div>
            </div>

            <div className="floating-card floating-card-top">
              <span className="floating-icon floating-icon-violet">
                <ShieldCheck size={19} />
              </span>
              <div>
                <strong>Community first</strong>
                <span>Every item matters</span>
              </div>
            </div>

            <div className="floating-card floating-card-bottom">
              <span className="floating-icon floating-icon-green">
                <CheckCircle2 size={19} />
              </span>
              <div>
                <strong>One less worry</strong>
                <span>One more reason to smile</span>
              </div>
            </div>

            <div className="visual-sparkle sparkle-one"><Sparkles size={19} /></div>
            <div className="visual-sparkle sparkle-two"><ArrowDownRight size={21} /></div>
          </div>
        </section>

        <section className="benefits-strip" aria-label="Portal benefits">
          <div className="benefit">
            <span className="benefit-icon"><Search size={19} /></span>
            <div>
              <strong>Find what matters</strong>
              <span>Search campus reports</span>
            </div>
          </div>
          <div className="benefit">
            <span className="benefit-icon"><ShieldCheck size={19} /></span>
            <div>
              <strong>Claim with confidence</strong>
              <span>Clear, trackable requests</span>
            </div>
          </div>
          <div className="benefit">
            <span className="benefit-icon"><Bell size={19} /></span>
            <div>
              <strong>Stay in the loop</strong>
              <span>Email updates when enabled</span>
            </div>
          </div>
        </section>

        <section className="reports-section section-container" id="recent-reports">
          <div className="section-heading">
            <div>
              <div className="eyebrow">A SECOND CHANCE TO BE FOUND</div>
              <h2>Recently on campus<span>.</span></h2>
              <p>Take a look around. Your missing item might be right here.</p>
            </div>
            <button className="text-link" type="button" onClick={() => openClaimDialog("mine")}>
              My claims <ArrowRight size={17} />
            </button>
          </div>

          <div className="report-toolbar">
            <div className="filter-tabs" role="group" aria-label="Filter reports">
              {filters.map((filter) => (
                <button
                  key={filter}
                  className={`filter-tab ${activeFilter === filter ? "filter-tab-active" : ""}`}
                  type="button"
                  aria-pressed={activeFilter === filter}
                  onClick={() => setActiveFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>

            <label className="search-field">
              <Search size={18} />
              <input
                type="search"
                placeholder="Search items or locations..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Search campus reports"
              />
              <ChevronDown className="search-field-chevron" size={16} />
            </label>
          </div>

          {isLoadingItems && (
            <div className="reports-feedback" role="status">
              <span className="loading-spinner" /> Loading campus reports…
            </div>
          )}

          {!isLoadingItems && itemsError && (
            <div className="reports-feedback reports-feedback-error" role="alert">
              <h3>We couldn’t load campus reports</h3>
              <p>{itemsError}</p>
              <button className="button button-outline" type="button" onClick={() => window.location.reload()}>
                Try again
              </button>
            </div>
          )}

          {!isLoadingItems && !itemsError && <div className="items-grid">
            {visibleItems.map((item) => {
              const ItemIcon = item.icon;
              return (
                <article className="item-card" key={item.id}>
                  <div className="item-image-wrap">
                    {item.image ? (
                      <img className="item-image" src={item.image} alt={item.title} loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                          event.currentTarget.parentElement?.classList.add("item-image-failed");
                        }} />
                    ) : (
                      <div className="item-image item-image-placeholder"><ItemIcon size={44} aria-hidden="true" /><span>No photo provided</span></div>
                    )}
                    <span className={`item-type-badge ${item.type === "Lost" ? "badge-lost" : "badge-found"}`}>
                      <span className="badge-dot" />
                      {item.type} item
                    </span>
                    <button
                      className="item-quick-action"
                      type="button"
                      aria-label={`View ${item.title} details`}
                      onClick={() => handleViewItemDetails(item)}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                  <div className="item-card-content">
                    <div className="item-category">
                      <ItemIcon size={14} />
                      {item.category}
                    </div>
                    <h3>{item.title}</h3>
                    <div className="item-meta">
                      <span><MapPin size={14} /> {item.location}</span>
                      <span><Clock3 size={14} /> {item.date}</span>
                    </div>
                    <div className="item-card-footer">
                      <span className="report-id">REPORT #{String(item.id).padStart(4, "0")}</span>
                      <button className="view-details" type="button" onClick={() => handleViewItemDetails(item)}>View details <ArrowRight size={14} /></button>
                    </div>
                    <div className="item-claim-actions">
                      {item.status === "open" && item.postedBy !== currentUser?.id && (
                        <button className="item-claim-button" type="button" onClick={() => {
                          if (!getAccessToken()) { setDialogMode("login"); return; }
                          openClaimDialog("claim", item);
                        }}>
                          {item.type === "Lost" ? "I found this item" : "Claim this item"}
                        </button>
                      )}
                      {currentUser && item.postedBy === currentUser.id && item.status === "claim_requested" && (
                        <button className="item-review-button" type="button" onClick={() => openClaimDialog("review", item)}>
                          Review responses
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>}

          {!isLoadingItems && !itemsError && visibleItems.length === 0 && (
            <div className="empty-state">
              <Search size={28} />
              <h3>{items.length === 0 ? "No reports have been posted yet" : "No matching reports"}</h3>
              <p>{items.length === 0 ? "When students post lost or found items, they will appear here." : "Try another search term or choose a different filter."}</p>
              <button
                className="button button-outline"
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setActiveFilter("All items");
                }}
              >
                Clear filters
              </button>
            </div>
          )}

          {!isLoadingItems && !itemsError && items.length > 0 && (
            <div className="reports-note">
              <Sparkles size={20} />
              <span>Showing live campus reports from the CampusLoop community.</span>
            </div>
          )}
        </section>

        <section className="how-section" id="how-it-works">
          <div className="section-container">
            <div className="how-heading">
              <div className="eyebrow">THREE SIMPLE STEPS</div>
              <h2>A little effort.<br /><span>A big difference.</span></h2>
              <p>Getting your belongings back shouldn't be complicated.</p>
            </div>

            <div className="steps-grid">
              <article className="step-card">
                <span className="step-number">01</span>
                <span className="step-icon"><Camera size={24} /></span>
                <h3>Share the details</h3>
                <p>Post a lost or found report with a photo, description and campus location.</p>
                <span className="step-decoration">REPORT</span>
              </article>
              <article className="step-card step-card-featured">
                <span className="step-number">02</span>
                <span className="step-icon"><Search size={24} /></span>
                <h3>Find a match</h3>
                <p>Browse reports and use search filters to narrow down what you're looking for.</p>
                <span className="step-decoration">DISCOVER</span>
              </article>
              <article className="step-card">
                <span className="step-number">03</span>
                <span className="step-icon"><CheckCircle2 size={24} /></span>
                <h3>Reconnect</h3>
                <p>Submit a claim, follow its status and let the right item find its way home.</p>
                <span className="step-decoration">RECONNECT</span>
              </article>
            </div>
          </div>
        </section>

        <section className="community-section section-container" id="community">
          <div className="community-card">
            <div className="community-copy">
              <div className="eyebrow eyebrow-light"><Sparkles size={14} /> MORE THAN LOST & FOUND</div>
              <h2>Good things happen<br />when we <span>look out for each other.</span></h2>
              <p>One report, one thoughtful gesture, one less thing to worry about. It all adds up to a better campus community.</p>
              <button className="button button-light" type="button" onClick={() => handleReportClick("Found")}>
                Be someone's good day <ArrowRight size={17} />
              </button>
            </div>
            <div className="community-art" aria-hidden="true">
              <div className="community-orbit orbit-one" />
              <div className="community-orbit orbit-two" />
              <div className="community-center"><Compass size={54} strokeWidth={1.4} /></div>
              <span className="community-bubble bubble-one"><CheckCircle2 size={22} /></span>
              <span className="community-bubble bubble-two"><HeartIcon /></span>
              <span className="community-bubble bubble-three"><MapPin size={22} /></span>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#home">
          <span className="brand-mark"><Compass size={22} /></span>
          <span className="brand-copy">
            <strong>campus<span>loop</span></strong>
            <small>LOST & FOUND, RECONNECTED</small>
          </span>
        </a>
        <p>Made for campus. Built around community.</p>
        <a href="#home" className="back-to-top">Back to top ↑</a>
        <span className="footer-copyright">© {new Date().getFullYear()} CampusLoop</span>
      </footer>


      {detailsItem && (
        <div className="item-details-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDetailsItem(null);
        }}>
          <section className="item-details-modal" role="dialog" aria-modal="true" aria-labelledby="item-details-title">
            <button className="item-details-close" type="button" aria-label="Close report details" onClick={() => setDetailsItem(null)}><X size={21} /></button>
            <div className="item-details-hero">
              {detailsItem.image ? (
                <img src={detailsItem.image} alt={detailsItem.title} onError={(event) => {
                  event.currentTarget.style.display = "none";
                  event.currentTarget.parentElement?.classList.add("item-details-image-failed");
                }} />
              ) : (
                <div className="item-details-image-placeholder"><detailsItem.icon size={54} /><span>No photo provided</span></div>
              )}
              <span className={`item-details-type ${detailsItem.type === "Lost" ? "badge-lost" : "badge-found"}`}><span className="badge-dot" /> {detailsItem.type} item</span>
            </div>
            <div className="item-details-body">
              <div className="item-details-category"><detailsItem.icon size={16} /> {detailsItem.category}</div>
              <h2 id="item-details-title">{detailsItem.title}</h2>
              <p className="item-details-description">{detailsItem.description}</p>
              <div className="item-details-meta">
                <div><MapPin size={17} /><span><small>Last seen / found at</small><strong>{detailsItem.location}</strong></span></div>
                <div><Clock3 size={17} /><span><small>Report date</small><strong>{detailsItem.date}</strong></span></div>
              </div>
              <div className="item-details-poster">
                <span className="item-details-avatar"><UserRound size={20} /></span>
                <span className="item-details-poster-copy"><small>Posted by</small><strong>{detailsItem.posterName}</strong></span>
                <span className={`item-details-status status-${detailsItem.status.replace(/_/g, "-")}`}>{detailsItem.status.replace(/_/g, " ")}</span>
              </div>
              <div className="item-details-actions">
                {detailsItem.status === "open" && detailsItem.postedBy !== currentUser?.id && (
                  <button className="button button-primary" type="button" onClick={() => {
                    const itemToClaim = detailsItem;
                    setDetailsItem(null);
                    openClaimDialog("claim", itemToClaim);
                  }}>{detailsItem.type === "Lost" ? "I found this item" : "Claim this item"} <ArrowRight size={17} /></button>
                )}
                <button className="button button-outline" type="button" onClick={() => setDetailsItem(null)}>Close details</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {dialogMode && (
        <PortalDialog
          mode={dialogMode}
          reportType={reportType}
          oauthError={oauthError}
          onClose={() => {
            setDialogMode(null);
            setOauthError("");
          }}
          onSuccess={handleDialogSuccess}
        />
      )}

      {claimsDialogMode && (
        <ClaimsDialog
          mode={claimsDialogMode}
          itemId={selectedClaimItem?.id}
          itemTitle={selectedClaimItem?.title}
          itemType={selectedClaimItem?.type === "Lost" ? "lost" : "found"}
          onClose={() => { setClaimsDialogMode(null); setSelectedClaimItem(null); }}
          onSuccess={handleClaimsSuccess}
        />
      )}

      {myReportsOpen && <MyReportsDialog onClose={() => setMyReportsOpen(false)} />}
      {analyticsOpen && <AnalyticsDashboard onClose={() => setAnalyticsOpen(false)} />}
    </div>
  );
}

function HeartIcon() {
  return <Sparkles size={22} />;
}

export default App;
