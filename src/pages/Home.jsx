const features = [
  ['✦', 'AI Venue Visualization', 'Upload your venue photo and preview it with your chosen theme and decorations.'],
  ['◌', 'Real-Time Messaging', 'Communicate directly with caterers to clarify details before your event.'],
  ['▣', 'Flexible Payment', 'Secure your booking with a partial down payment and settle the balance later.'],
  ['✓', 'Verified Caterers', 'Browse caterers verified with valid business permits and service details.'],
  ['⌁', 'Smart Recommendations', 'Get package, theme, and setup suggestions shaped around your event.'],
  ['◉', 'Visual Alignment', 'See what your event can look like before making a commitment.'],
];

const steps = [
  ['01', 'Browse & Select Packages', 'Explore verified caterers and packages for different event types and budgets.'],
  ['02', 'Visualize Your Event', 'Upload a venue photo and preview your selected theme and decorations.'],
  ['03', 'Book & Pay', 'Complete your reservation with a secure partial payment.'],
  ['04', 'Enjoy Your Event', 'Relax while your professional caterer handles the details.'],
];

export default function Home() {
  return <main>
    <nav className="navbar"><a className="brand" href="/">Cater<span>AI</span></a><div className="nav-links"><a href="/packages">Packages</a><a href="#features">Features</a><a href="#how-it-works">How it works</a><a className="nav-login" href="/login">Log in</a></div></nav>
    <section className="hero"><div className="hero-copy reveal"><p className="eyebrow">Events, thoughtfully arranged</p><h1>Your event,<br /><em>beautifully served.</em></h1><p className="hero-description">Find trusted event-service providers, shape the right package, and visualize the atmosphere before the big day.</p><div className="hero-actions"><a className="button button-primary" href="/packages">Explore packages <span>↗</span></a><a className="text-link" href="#how-it-works">See how it works <span>↓</span></a></div></div><div className="hero-art reveal reveal-delay" aria-label="Event styling illustration"><div className="sun" /><div className="plate plate-large" /><div className="plate plate-small" /><div className="glass glass-one" /><div className="glass glass-two" /><div className="leaf leaf-one" /><div className="leaf leaf-two" /><div className="art-caption"><strong>Made for memorable gatherings</strong><span>From first idea to final toast</span></div></div></section>
    <section className="payment-strip"><span className="strip-label">Payment that fits your plans</span><span>Digital wallet</span><span>•</span><span>Face-to-face cash</span><span>•</span><span>Live status updates</span></section>
    <section className="section" id="features"><div className="section-heading"><p className="eyebrow">Everything in one place</p><h2>From a blank canvas<br />to a full table.</h2></div><div className="feature-grid">{features.map(([icon, title, text]) => <article className="feature-card" key={title}><div className="feature-icon">{icon}</div><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section className="process-section" id="how-it-works"><div className="section-heading"><p className="eyebrow">A simpler way to celebrate</p><h2>Four steps to<br /><em>your kind of perfect.</em></h2></div><div className="steps-grid">{steps.map(([number, title, text]) => <article className="step-card" key={number}><span className="step-number">{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <footer><a className="brand" href="/">Cater<span>AI</span></a><p>© 2026 CaterAI. Made for gatherings worth remembering.</p><a href="/login">Start planning ↗</a></footer>
  </main>;
}
