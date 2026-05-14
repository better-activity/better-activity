import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import {
  ArrowRight,
  Boxes,
  Clock,
  Database,
  GitBranch,
  Globe,
  History,
  Layers,
  MapPin,
  Radio,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { baseOptions } from "@/lib/layout.shared";
import { cn } from "@/lib/cn";
import { gitConfig } from "@/lib/shared";
import { GithubIcon } from "@/components/icons/github-icon";
import { XIcon } from "@/components/icons/x-icon";

export const Route = createFileRoute("/")({
  component: Home,
});

const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="flex flex-col flex-1">
        <Hero />
        <CodePreview />
        <Features />
        <Adapters />
        <Maintainers />
        <FinalCta />
      </main>
    </HomeLayout>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-fd-border">
      <BackgroundGrid />
      <BackgroundGlow />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pt-24 pb-20 text-center sm:pt-32 sm:pb-28">
        <a
          href={githubUrl}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card/60 px-3 py-1 text-xs font-medium text-fd-muted-foreground backdrop-blur transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
        >
          <span className="flex size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_theme(colors.emerald.500)]" />
          v0.1.0 · MIT Licensed
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </a>

        <h1 className="mt-6 max-w-4xl text-balance text-4xl font-semibold tracking-tight text-fd-foreground sm:text-6xl md:text-7xl">
          The type-safe{" "}
          <span className="relative inline-block">
            <span className="bg-gradient-to-br from-fd-foreground via-fd-foreground to-fd-muted-foreground bg-clip-text text-transparent">
              activity log
            </span>
            <span
              aria-hidden
              className="absolute inset-x-0 -bottom-1 h-px bg-gradient-to-r from-transparent via-fd-primary to-transparent opacity-60"
            />
          </span>{" "}
          for TypeScript
        </h1>

        <p className="mt-6 max-w-2xl text-balance text-base text-fd-muted-foreground sm:text-lg">
          Framework-agnostic, multi-database audit logging modeled on the
          architecture of <CodeMark>better-auth</CodeMark>. Declare your
          entities once, log everything that happens, query it with confidence.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/docs/$"
            params={{ _splat: "" }}
            className="group inline-flex items-center gap-2 rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground shadow-lg shadow-fd-primary/20 transition-all hover:translate-y-[-1px] hover:shadow-fd-primary/40"
          >
            Get Started
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-card/60 px-5 py-2.5 text-sm font-medium text-fd-foreground backdrop-blur transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
          >
            <GithubIcon className="size-4" />
            Star on GitHub
          </a>
        </div>

        <InstallCommand />
      </div>
    </section>
  );
}

function InstallCommand() {
  return (
    <div className="mt-10 flex items-center gap-3 rounded-xl border border-fd-border bg-fd-card/60 px-4 py-2.5 font-mono text-sm text-fd-muted-foreground shadow-sm backdrop-blur">
      <Terminal className="size-4 text-fd-primary" />
      <span className="select-none text-fd-muted-foreground/60">$</span>
      <span className="text-fd-foreground">pnpm add</span>
      <span className="text-fd-primary">better-activity</span>
    </div>
  );
}

function CodePreview() {
  return (
    <section className="relative -mt-12 px-6 pb-24">
      <div className="mx-auto max-w-5xl">
        <div className="group relative">
          <div
            aria-hidden
            className="absolute -inset-px rounded-2xl bg-gradient-to-br from-fd-primary/30 via-fd-border to-fd-border opacity-50 blur-sm transition-opacity group-hover:opacity-80"
          />
          <div className="relative overflow-hidden rounded-2xl border border-fd-border bg-fd-card shadow-2xl">
            <div className="flex items-center gap-2 border-b border-fd-border bg-fd-muted/40 px-4 py-3">
              <div className="flex gap-1.5">
                <span className="size-3 rounded-full bg-red-400/80" />
                <span className="size-3 rounded-full bg-yellow-400/80" />
                <span className="size-3 rounded-full bg-green-400/80" />
              </div>
              <span className="ml-2 font-mono text-xs text-fd-muted-foreground">
                activity.ts
              </span>
            </div>
            <pre className="overflow-x-auto p-6 font-mono text-[13px] leading-relaxed">
              <code>
                <Line>
                  <T.Keyword>import</T.Keyword> {"{ "}
                  <T.Var>betterActivity</T.Var>
                  {" }"} <T.Keyword>from</T.Keyword>{" "}
                  <T.Str>"better-activity"</T.Str>;
                </Line>
                <Line>
                  <T.Keyword>import</T.Keyword> {"{ "}
                  <T.Var>postgresAdapter</T.Var>
                  {" }"} <T.Keyword>from</T.Keyword>{" "}
                  <T.Str>"better-activity/adapters/postgres"</T.Str>;
                </Line>
                <Line />
                <Line>
                  <T.Keyword>export</T.Keyword> <T.Keyword>const</T.Keyword>{" "}
                  <T.Var>activity</T.Var> = <T.Fn>betterActivity</T.Fn>({"{"}
                </Line>
                <Line indent={1}>
                  <T.Prop>database</T.Prop>: <T.Fn>postgresAdapter</T.Fn>({"{ "}
                  <T.Prop>pool</T.Prop> {"}"}),
                </Line>
                <Line indent={1}>
                  <T.Prop>entities</T.Prop>: {"{"}
                </Line>
                <Line indent={2}>
                  <T.Prop>user</T.Prop>: {"{"}
                </Line>
                <Line indent={3}>
                  <T.Prop>actions</T.Prop>: [<T.Str>"created"</T.Str>,{" "}
                  <T.Str>"updated"</T.Str>, <T.Str>"logged_in"</T.Str>],
                </Line>
                <Line indent={3}>
                  <T.Prop>metadata</T.Prop>: {"{}"} <T.Keyword>as</T.Keyword>{" "}
                  {"{ "}
                  <T.Prop>ip</T.Prop>?: <T.Type>string</T.Type>;{" "}
                  <T.Prop>userAgent</T.Prop>?: <T.Type>string</T.Type>
                  {" }"},
                </Line>
                <Line indent={2}>{"}"},</Line>
                <Line indent={2}>
                  <T.Prop>project</T.Prop>: {"{"}
                </Line>
                <Line indent={3}>
                  <T.Prop>actions</T.Prop>: [<T.Str>"created"</T.Str>,{" "}
                  <T.Str>"archived"</T.Str>, <T.Str>"member_added"</T.Str>],
                </Line>
                <Line indent={2}>{"}"},</Line>
                <Line indent={1}>{"}"},</Line>
                <Line>{"});"}</Line>
                <Line />
                <Line>
                  <T.Comment>
                    {"// Fully-typed save() — checked at compile time"}
                  </T.Comment>
                </Line>
                <Line>
                  <T.Keyword>await</T.Keyword> <T.Var>activity</T.Var>.
                  <T.Fn>save</T.Fn>({"{"}
                </Line>
                <Line indent={1}>
                  <T.Prop>entity</T.Prop>: <T.Str>"user"</T.Str>,{" "}
                  <T.Prop>action</T.Prop>: <T.Str>"logged_in"</T.Str>,
                </Line>
                <Line indent={1}>
                  <T.Prop>entityId</T.Prop>: <T.Str>"usr_123"</T.Str>,{" "}
                  <T.Prop>actorId</T.Prop>: <T.Str>"usr_123"</T.Str>,
                </Line>
                <Line indent={1}>
                  <T.Prop>metadata</T.Prop>: {"{ "}
                  <T.Prop>ip</T.Prop>: <T.Str>"1.2.3.4"</T.Str> {"}"},
                </Line>
                <Line>{"});"}</Line>
              </code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: ShieldCheck,
      title: "Type-safe per entity",
      desc: "Declare entities and their allowed actions once. save() and list() are fully checked at compile time — no stringly-typed events.",
    },
    {
      icon: Database,
      title: "Eight adapters, one API",
      desc: "Postgres, MySQL, SQLite, MongoDB, Drizzle, Prisma, Kysely, and in-memory for tests. Swap the backend without touching the call site.",
    },
    {
      icon: Layers,
      title: "Flexible metadata",
      desc: "Attach arbitrary JSON to any event. Opt into strict types per entity for end-to-end safety from the producer to the query.",
    },
    {
      icon: Clock,
      title: "Cursor pagination",
      desc: "Stable cursors, by-actor lookups, and time-range queries built in. Designed to scale from one row to billions.",
    },
    {
      icon: Radio,
      title: "Realtime subscribers",
      desc: "In-process subscribers and before/after hooks let you fan events out to webhooks, queues, or live UIs.",
    },
    {
      icon: GitBranch,
      title: "CLI & migrations",
      desc: "Generate or apply the schema for your configured adapter with a single command. No hand-rolled SQL.",
    },
  ];

  return (
    <section className="relative border-t border-fd-border bg-fd-background">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Features"
          title="Everything you need to track changes."
          description="An audit log shouldn't be a side project. better-activity gives you the primitives to record, query, and react to every meaningful event in your app."
        />

        <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-fd-border bg-fd-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof ShieldCheck;
  title: string;
  desc: string;
}) {
  return (
    <div className="group relative bg-fd-background p-7 transition-colors hover:bg-fd-card">
      <div className="flex size-10 items-center justify-center rounded-lg border border-fd-border bg-fd-card text-fd-primary transition-colors group-hover:border-fd-primary/40">
        <Icon className="size-5" />
      </div>
      <h3 className="mt-5 text-base font-semibold text-fd-foreground">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">
        {desc}
      </p>
    </div>
  );
}

function Adapters() {
  const adapters = [
    { name: "Postgres", icon: Database },
    { name: "MySQL", icon: Database },
    { name: "SQLite", icon: Database },
    { name: "MongoDB", icon: Database },
    { name: "Drizzle", icon: Boxes },
    { name: "Prisma", icon: Boxes },
    { name: "Kysely", icon: Boxes },
    { name: "In-Memory", icon: Zap },
  ];

  return (
    <section className="relative overflow-hidden border-t border-fd-border bg-fd-muted/20">
      <BackgroundGrid />
      <div className="relative mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Adapters"
          title="Bring your own database."
          description="One core, every backend. Each adapter ships with its own schema, indices, and pagination strategy — tuned for the engine you actually run."
        />

        <div className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {adapters.map(({ name, icon: Icon }) => (
            <div
              key={name}
              className="group flex items-center gap-3 rounded-xl border border-fd-border bg-fd-card/60 px-4 py-3.5 backdrop-blur transition-all hover:translate-y-[-1px] hover:border-fd-primary/40 hover:shadow-md"
            >
              <Icon className="size-5 text-fd-muted-foreground transition-colors group-hover:text-fd-primary" />
              <span className="text-sm font-medium text-fd-foreground">
                {name}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Stat
            icon={History}
            value="Cursor"
            label="Pagination that stays stable as rows arrive."
          />
          <Stat
            icon={Workflow}
            value="Hooks"
            label="before / after save with full event context."
          />
          <Stat
            icon={Sparkles}
            value="React"
            label="Hooks, optimistic inserts, realtime feeds."
          />
        </div>
      </div>
    </section>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof ShieldCheck;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-fd-border bg-fd-card/60 p-5 backdrop-blur">
      <div className="flex items-center gap-2 text-fd-primary">
        <Icon className="size-4" />
        <span className="font-mono text-xs uppercase tracking-wider">
          {value}
        </span>
      </div>
      <p className="mt-2 text-sm text-fd-muted-foreground">{label}</p>
    </div>
  );
}

type Maintainer = {
  name: string;
  role: string;
  avatar: string;
  location: string;
  links: {
    github?: string;
    x?: string;
    website?: string;
  };
};

const maintainers: Maintainer[] = [
  {
    name: "Dan Zabrotski",
    role: "Creator & Maintainer",
    avatar: "/dan.png",
    location: "United States",
    links: {
      github: "https://github.com/dan-speekl",
      x: "https://x.com/dantechceo",
      website: "https://danzabrotski.com/",
    },
  },
];

function Maintainers() {
  return (
    <section className="relative border-t border-fd-border bg-fd-background">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Maintainers"
          title="Built and maintained with care."
          description="better-activity is open source and shaped by the people behind it. Reach out, file an issue, or send a PR — contributions are welcome."
        />

        <div className="mx-auto mt-14 grid max-w-md grid-cols-1 gap-6 sm:max-w-3xl sm:grid-cols-1 md:grid-cols-1">
          {maintainers.map((m) => (
            <MaintainerCard key={m.name} maintainer={m} />
          ))}
        </div>
      </div>
    </section>
  );
}

function MaintainerCard({ maintainer }: { maintainer: Maintainer }) {
  const { name, role, avatar, location, links } = maintainer;
  return (
    <div className="group relative">
      <div
        aria-hidden
        className="absolute -inset-px rounded-2xl bg-linear-to-br from-fd-primary/20 via-fd-border to-fd-border opacity-40 blur-sm transition-opacity group-hover:opacity-70"
      />
      <div className="relative flex flex-col items-center gap-6 rounded-2xl border border-fd-border bg-fd-card p-8 text-center sm:flex-row sm:text-left">
        <div className="relative shrink-0">
          <div
            aria-hidden
            className="absolute -inset-1 rounded-full bg-linear-to-br from-fd-primary/40 to-fd-primary/0 blur-md"
          />
          <img
            src={avatar}
            alt={name}
            className="relative size-24 rounded-full border border-fd-border object-cover shadow-md"
          />
        </div>

        <div className="flex flex-1 flex-col items-center sm:items-start">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h3 className="text-lg font-semibold text-fd-foreground">{name}</h3>
            <span className="rounded-full border border-fd-border bg-fd-muted/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fd-muted-foreground">
              {role}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-sm text-fd-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            <span>{location}</span>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {links.github && (
              <SocialLink href={links.github} label="GitHub">
                <GithubIcon className="size-4" />
              </SocialLink>
            )}
            {links.x && (
              <SocialLink href={links.x} label="X (Twitter)">
                <XIcon className="size-3.5" />
              </SocialLink>
            )}
            {links.website && (
              <SocialLink href={links.website} label="Website">
                <Globe className="size-4" />
              </SocialLink>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="inline-flex size-9 items-center justify-center rounded-lg border border-fd-border bg-fd-background text-fd-muted-foreground transition-colors hover:border-fd-primary/40 hover:bg-fd-accent hover:text-fd-foreground"
    >
      {children}
    </a>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-fd-border">
      <BackgroundGlow />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-6 py-28 text-center">
        <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight text-fd-foreground sm:text-5xl">
          Start logging what matters.
        </h2>
        <p className="mt-5 max-w-xl text-balance text-fd-muted-foreground sm:text-lg">
          Wire up better-activity in minutes. Replace your homegrown audit
          table, kill your event-tracking todo list, and ship with confidence.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/docs/$"
            params={{ _splat: "" }}
            className="group inline-flex items-center gap-2 rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground shadow-lg shadow-fd-primary/20 transition-all hover:translate-y-[-1px] hover:shadow-fd-primary/40"
          >
            Read the docs
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-card/60 px-5 py-2.5 text-sm font-medium text-fd-foreground backdrop-blur transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
          >
            <GithubIcon className="size-4" />
            View source
          </a>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-fd-primary">
        {eyebrow}
      </span>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-fd-foreground sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-balance text-fd-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function CodeMark({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md border border-fd-border bg-fd-muted/60 px-1.5 py-0.5 font-mono text-[0.85em] text-fd-foreground">
      {children}
    </code>
  );
}

function BackgroundGrid() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--color-fd-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-fd-border)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)] opacity-40"
    />
  );
}

function BackgroundGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute left-1/2 top-0 size-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-fd-primary/10 blur-3xl" />
      <div className="absolute right-1/4 bottom-0 size-[400px] translate-y-1/3 rounded-full bg-fd-primary/5 blur-3xl" />
    </div>
  );
}

function Line({
  children,
  indent = 0,
}: {
  children?: ReactNode;
  indent?: number;
}) {
  return (
    <div
      className={cn(indent > 0 && "pl-[calc(var(--indent)*1ch)]")}
      style={
        indent > 0
          ? ({ "--indent": indent * 2 } as React.CSSProperties)
          : undefined
      }
    >
      {children ?? "\u00A0"}
    </div>
  );
}

const T = {
  Keyword: ({ children }: { children: ReactNode }) => (
    <span className="text-purple-500 dark:text-purple-400">{children}</span>
  ),
  Str: ({ children }: { children: ReactNode }) => (
    <span className="text-emerald-600 dark:text-emerald-400">{children}</span>
  ),
  Fn: ({ children }: { children: ReactNode }) => (
    <span className="text-blue-600 dark:text-blue-400">{children}</span>
  ),
  Var: ({ children }: { children: ReactNode }) => (
    <span className="text-fd-foreground">{children}</span>
  ),
  Prop: ({ children }: { children: ReactNode }) => (
    <span className="text-orange-600 dark:text-orange-300">{children}</span>
  ),
  Type: ({ children }: { children: ReactNode }) => (
    <span className="text-cyan-600 dark:text-cyan-300">{children}</span>
  ),
  Comment: ({ children }: { children: ReactNode }) => (
    <span className="text-fd-muted-foreground italic">{children}</span>
  ),
};
