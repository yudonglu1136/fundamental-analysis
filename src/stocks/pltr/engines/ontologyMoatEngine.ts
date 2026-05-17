export function calculateOntologyMoatEngine() {
  const factors = [
    {
      label: "Data integration depth",
      score: 86,
      evidence: "Ontology maps messy enterprise data into operating objects, properties, links, actions, and permissions.",
      confirm: "More customers deploy operational workflows across multiple systems and departments.",
      disconfirm: "AIP deployments stay isolated to demos, chat, or narrow analytics workflows.",
    },
    {
      label: "Workflow embedding",
      score: 84,
      evidence: "Palantir positions the platform around operational decisions rather than only analytics dashboards.",
      confirm: "Use cases become daily operating systems for manufacturing, defense, healthcare, energy, and finance teams.",
      disconfirm: "Customers treat Palantir as a services-heavy integration layer with limited reusable product leverage.",
    },
    {
      label: "Permission and governance complexity",
      score: 88,
      evidence: "Official documentation emphasizes granular security, audit, governance, and agent access controls.",
      confirm: "Regulated and mission-critical customers expand AIP agents inside strict permission boundaries.",
      disconfirm: "Hyperscalers or in-house platforms replicate controls with lower switching friction.",
    },
    {
      label: "Mission-critical use case",
      score: 90,
      evidence: "Gotham, defense, intelligence, and operational commercial deployments create high switching cost when embedded.",
      confirm: "Government and large commercial customers renew and expand after initial AIP deployments.",
      disconfirm: "Budget pressure or procurement fatigue causes large programs to churn or shrink.",
    },
    {
      label: "Model-agnostic AI orchestration",
      score: 80,
      evidence: "AIP is framed as secure connectivity between LLMs, private data, actions, and evaluations.",
      confirm: "Customers use multiple model providers through AIP while Palantir captures orchestration value.",
      disconfirm: "AIP becomes a thin wrapper around model APIs with limited pricing power.",
    },
  ];

  return {
    score: Math.round(factors.reduce((sum, factor) => sum + factor.score, 0) / factors.length),
    factors,
  };
}
