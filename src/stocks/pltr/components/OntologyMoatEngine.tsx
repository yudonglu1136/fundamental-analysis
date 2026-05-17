import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import { InsightBox, SourceNote, type PltrComponentProps } from "./PLTRPrimitives";

export function OntologyMoatEngine({ dashboard }: PltrComponentProps) {
  return (
    <SectionCard
      title="Ontology Moat Engine"
      description="Investor question: is Palantir more than an AI model wrapper because it controls the operational ontology layer?"
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dashboard.ontology.factors} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis dataKey="label" type="category" width={140} />
              <Tooltip />
              <Bar dataKey="score" fill="#2563eb" name="Score" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <InsightBox title="Why Ontology Matters">
          The ontology is the operating layer between data, logic, decisions, permissions, actions, and AI agents. That is why AIP can be more than a chatbot wrapper if customers use it to run real workflows with governed actions.
        </InsightBox>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {dashboard.ontology.factors.map((factor) => (
          <InsightBox key={factor.label} title={`${factor.label}: ${factor.score}/100`}>
            <p>{factor.evidence}</p>
            <p className="mt-2"><span className="font-semibold text-ink">Confirm:</span> {factor.confirm}</p>
            <p className="mt-2"><span className="font-semibold text-ink">Disconfirm:</span> {factor.disconfirm}</p>
          </InsightBox>
        ))}
      </div>
      <div className="mt-4">
        <SourceNote>Moat score is not a valuation input. It must be explicitly mapped to retention, pricing, margin, or growth before entering a model.</SourceNote>
      </div>
    </SectionCard>
  );
}
