import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Icon } from "./Icon";

export type View = "home" | "results" | "saved" | "profile";

export function Navigation({
  onNavigate,
  onAuth,
  onExplore,
  onPlan,
  view,
  overHero,
}: {
  onNavigate: (view: View) => void;
  onAuth: () => void;
  onExplore: () => void;
  onPlan: () => void;
  view: View;
  overHero?: boolean;
}) {
  const { user, signOut } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const transparent = overHero && !scrolled;

  return (
    <header className={`nav${transparent ? " nav--over" : " nav--solid"}`}>
      <div className="container nav__inner">
        <button className="nav__brand" onClick={() => onNavigate("home")}>
          SIDEQUEST
        </button>

        <nav className="nav__links">
          <button className={view === "home" ? "on" : ""} onClick={onExplore}>
            Explore
          </button>
          <button onClick={onPlan}>Plan</button>
          <button
            className={view === "saved" ? "on" : ""}
            onClick={() => (user ? onNavigate("saved") : onAuth())}
          >
            My Sidequests
          </button>
        </nav>

        <div className="nav__right">
          {user ? (
            <>
              <button className="nav__avatar" onClick={() => onNavigate("profile")}>
                {user.name.charAt(0).toUpperCase()}
              </button>
              <button className="nav__signin" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <button className="nav__signin" onClick={onAuth}>
              Sign in
            </button>
          )}
          <button className="nav__cta" onClick={onPlan}>
            Start a sidequest <Icon name="arrowUpRight" size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}

