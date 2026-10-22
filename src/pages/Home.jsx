import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  BadgeCheck,
  Flower2,
  MessageCircle,
  Menu,
  Sparkles,
  WalletCards,
  X,
} from 'lucide-react';

const features = [
  [Sparkles, 'Preview your setup', 'Try out themes and decorations with a photo of your venue before you book.'],
  [MessageCircle, 'Talk to your decorator', 'Ask questions and settle the details directly with the people styling your event.'],
  [WalletCards, 'Plan payments clearly', 'See the deposit and remaining balance before you confirm a reservation.'],
  [BadgeCheck, 'Know who you’re booking', 'Explore decorator profiles, design portfolios, service details, and permit information.'],
  [Flower2, 'Find a package that fits', 'Compare decoration styles and setups for your venue, occasion, and budget.'],
  [ArrowUpRight, 'Keep plans in one place', 'Move from choosing a package to keeping track of your reservation.'],
];

const steps = [
  ['01', 'Find your style', 'Browse decorators and compare event styling packages.'],
  ['02', 'Picture the setup', 'Share a venue photo and preview a look for your celebration.'],
  ['03', 'Confirm the details', 'Message your decorator, review the payment breakdown, and book.'],
  ['04', 'Celebrate your day', 'Keep track of your reservation as your event gets closer.'],
];

export default function Home() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const elements = document.querySelectorAll('.landing-page [data-reveal]');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    elements.forEach((element) => {
      element.classList.add('is-ready');
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const closeMenu = () => setIsMenuOpen(false);

  return <main className="landing-page">
    <nav className="navbar" aria-label="Main navigation">
      <a className="brand" href="/" onClick={closeMenu}><img className="brand-mark" src="/caterai-logo.png" alt="" />Cater<span>AI</span></a>
      <button
        className="mobile-menu-toggle"
        type="button"
        aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-controls="landing-navigation"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((open) => !open)}
      >
        {isMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>
      <div className={`nav-links${isMenuOpen ? ' is-open' : ''}`} id="landing-navigation">
        <a href="/packages" onClick={closeMenu}>Packages</a>
        <a href="#features" onClick={closeMenu}>Why CaterAI</a>
        <a href="#how-it-works" onClick={closeMenu}>How it works</a>
        <a className="nav-login" href="/login" onClick={closeMenu}>Log in <ArrowUpRight size={14} aria-hidden="true" /></a>
      </div>
    </nav>

    <section className="hero">
      <div className="hero-copy" data-reveal>
        <p className="eyebrow"><span className="eyebrow-mark" aria-hidden="true" />Decoration for life’s good moments</p>
        <h1>Make your day<br /><em>feel like you.</em></h1>
        <p className="hero-description">Find an event decorator, explore styling packages, and picture your venue transformed—all in one place.</p>
        <div className="hero-actions">
          <a className="button button-primary" href="/packages">Explore decoration packages <ArrowUpRight size={17} aria-hidden="true" /></a>
          <a className="text-link" href="#how-it-works">How it works <ArrowDown size={15} aria-hidden="true" /></a>
        </div>
        <p className="hero-note"><span aria-hidden="true">✳</span> Thoughtful event styling for birthdays, weddings, and reunions.</p>
      </div>
      <div className="hero-art" data-reveal aria-hidden="true">
        <div className="art-topline"><span>SET THE SCENE</span><span>01 / 03</span></div>
        <div className="decor-arch" />
        <div className="decor-balloon balloon-one" />
        <div className="decor-balloon balloon-two" />
        <div className="decor-bloom bloom-one"><Flower2 size={48} strokeWidth={1.2} /></div>
        <div className="decor-bloom bloom-two"><Flower2 size={35} strokeWidth={1.2} /></div>
        <div className="leaf leaf-one" />
        <div className="leaf leaf-two" />
        <div className="decor-ribbon ribbon-one" />
        <div className="art-caption"><strong>A space that feels like you.</strong><span>Start with a theme. Add your own touch.</span></div>
        <div className="art-note"><span className="art-note-icon"><Flower2 size={17} /></span><span><small>A LITTLE INSPIRATION</small><strong>A celebration in your style</strong></span><ArrowUpRight size={16} /></div>
      </div>
    </section>

    <section className="payment-strip" aria-label="Booking highlights">
      <span className="strip-label">A smoother way to plan</span>
      <span><WalletCards size={17} aria-hidden="true" /> Payment options</span>
      <span><MessageCircle size={17} aria-hidden="true" /> Direct decorator chat</span>
      <span><BadgeCheck size={17} aria-hidden="true" /> Reservation updates</span>
    </section>

    <section className="section" id="features">
      <div className="section-heading" data-reveal>
        <p className="eyebrow">The good stuff, in one place</p>
        <h2>Less planning stress.<br /><em>More room to celebrate.</em></h2>
        <p className="section-intro">From the first inspiration to the finishing touches, bring your event look together without the back-and-forth.</p>
      </div>
      <div className="feature-grid" data-reveal>
        {features.map(([Icon, title, text]) => <article className="feature-card" key={title}>
          <div className="feature-icon"><Icon size={21} strokeWidth={1.7} aria-hidden="true" /></div>
          <h3>{title}</h3>
          <p>{text}</p>
        </article>)}
      </div>
    </section>

    <section className="process-section" id="how-it-works">
      <div className="process-inner">
        <div className="section-heading" data-reveal>
          <p className="eyebrow">From “what if?” to “see you there”</p>
          <h2>Your celebration,<br /><em>one step at a time.</em></h2>
        </div>
        <div className="steps-grid" data-reveal>
          {steps.map(([number, title, text]) => <article className="step-card" key={number}>
            <span className="step-number">{number}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>)}
        </div>
      </div>
    </section>

    <footer>
      <a className="brand" href="/"><img className="brand-mark" src="/caterai-logo.png" alt="" />Cater<span>AI</span></a>
      <p>© 2026 CaterAI. Beautiful spaces make lasting memories.</p>
      <a className="footer-cta" href="/packages">Let’s start planning <ArrowUpRight size={15} aria-hidden="true" /></a>
    </footer>
  </main>;
}
