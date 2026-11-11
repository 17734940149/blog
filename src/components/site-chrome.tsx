"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { Search, Sun, Moon, Menu, X } from "lucide-react";
import { useI18n } from "./providers";
import { useLocaleSwitch } from "./use-locale-switch";
import { BrandLogo } from "./brand-logo";

// 公共导航与后台布局分开渲染，后台保留自己的工作空间。
export function SiteChrome({
  children,
  title = "栈间",
  icpFilingNumber,
}: {
  children: ReactNode;
  title?: string;
  icpFilingNumber?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, t } = useI18n();
  const { switchLocale, pending: languagePending } = useLocaleSwitch();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [light, setLight] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const isAdmin = pathname.startsWith("/admin");

  useEffect(() => {
    setLight(document.documentElement.dataset.theme === "light");
  }, []);
  useEffect(() => {
    setMenu(false);
    setSearch(false);
  }, [pathname]);
  useEffect(() => {
    // 保留原生 dialog 的焦点管理，让快捷搜索也能用键盘关闭。
    if (search) dialog.current?.showModal();
    else dialog.current?.close();
  }, [search]);
  useEffect(() => {
    // 搜索快捷键只在公共站生效，不打断后台 Markdown 编辑。
    const onKey = (event: KeyboardEvent) => {
      if (!isAdmin && (event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setSearch((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAdmin]);

  // 只保存显示偏好，不向客户端存储认证信息。
  function toggleTheme() {
    const next = !light;
    document.documentElement.dataset.theme = next ? "light" : "dark";
    try {
      localStorage.setItem("theme", next ? "light" : "dark");
    } catch {
      /* 隐私模式禁止存储时仍允许本次切换。 */
    }
    setLight(next);
  }

  // 搜索保留在 URL 中，便于分享、刷新和浏览器返回。
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(
      new FormData(event.currentTarget).get("q") || "",
    ).trim();
    setSearch(false);
    router.push(`/blog${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  }

  if (isAdmin) return children;
  const links = [
    ["/", "home"],
    ["/blog", "writing"],
    ["/projects", "projects"],
  ];
  return (
    <>
      <a className="skip-link" href="#main">
        {t("common.skip")}
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label={`${title} GY`}>
            <span className="brand-mark" aria-hidden="true">
              <BrandLogo />
            </span>
            <span>{title}</span>
          </Link>
          <nav
            className={`main-nav ${menu ? "is-open" : ""}`}
            aria-label={t("common.menu")}
          >
            {links.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className={
                  (href === "/" ? pathname === "/" : pathname.startsWith(href))
                    ? "active"
                    : ""
                }
              >
                {t(`common.${label}`)}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            {pathname !== "/blog" && (
              <button
                className="search-trigger"
                onClick={() => setSearch(true)}
                aria-label={t("common.search")}
              >
                <Search size={17} />
              </button>
            )}
            <button
              className="icon-button language-button"
              onClick={switchLocale}
              disabled={languagePending}
              aria-busy={languagePending}
              title={t(
                languagePending
                  ? "common.switchingLanguage"
                  : locale === "zh"
                    ? "common.switchToEnglish"
                    : "common.switchToChinese",
              )}
              aria-label={t(
                languagePending
                  ? "common.switchingLanguage"
                  : locale === "zh"
                    ? "common.switchToEnglish"
                    : "common.switchToChinese",
              )}
            >
              {languagePending ? "…" : locale === "zh" ? "EN" : "中"}
            </button>
            <button
              className="icon-button"
              onClick={toggleTheme}
              aria-label={t("common.theme")}
            >
              {light ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
              aria-label={t("common.menu")}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>
      {children}
      <footer className="site-footer container">
        <p>
          © {new Date().getFullYear()} {title}
        </p>
        <div className="footer-links">
          <a href="/feed.xml">{t("common.rss")}</a>
        </div>
        {icpFilingNumber && (
          <p className="footer-filing">
            <a href="https://beian.miit.gov.cn/">{icpFilingNumber}</a>
          </p>
        )}
      </footer>
      <dialog
        ref={dialog}
        className="search-dialog"
        onCancel={() => setSearch(false)}
        onClick={(event) => {
          if (event.target === dialog.current) setSearch(false);
        }}
      >
        <div className="search-dialog-inner">
          <div className="dialog-title">
            <h2>{t("common.search")}</h2>
            <button
              className="icon-button"
              onClick={() => setSearch(false)}
              aria-label={t("common.close")}
            >
              <X size={20} />
            </button>
          </div>
          <p>{t("common.searchHint")}</p>
          <form onSubmit={submitSearch}>
            <Search size={22} />
            <input
              name="q"
              aria-label={t("common.search")}
              placeholder={t("common.searchPlaceholder")}
              autoFocus
              maxLength={100}
            />
            <button className="button primary" type="submit">
              {t("common.search")}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
