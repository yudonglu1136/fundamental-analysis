import { SectionCard } from "../../../components/shared/SectionCard";
import { InsightBox, RiskBadge, SourceNote, type IsrgComponentProps } from "./ISRGPrimitives";

function statusLabel(record: { sourceStatus?: string; sourceType?: string }) {
  return record.sourceStatus ?? record.sourceType ?? "unknown";
}

export function DataBoundaryPanel({ dashboard }: IsrgComponentProps) {
  return (
    <SectionCard
      title="Data Boundary"
      description="Official actuals, guidance, assumptions, transcripts, market data, and research-only materials are kept separate so the model does not launder narrative into valuation."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <InsightBox title="Allowed In Valuation">
          <p>Official actuals, validated derived metrics, management guidance mapped through assumptions, and explicit forecast assumptions.</p>
        </InsightBox>
        <InsightBox title="Research-only By Default">
          <p>Transcripts, product announcements, competition notes, FDA/MAUDE watch items, and qualitative moat evidence.</p>
        </InsightBox>
        <InsightBox title="Market Data Boundary">
          <p>Price, market cap, EV, beta, and multiples are used for reverse valuation and sanity checks, not fundamental actuals.</p>
        </InsightBox>
      </div>
      <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {dashboard.sources.map((source) => (
              <tr key={source.id}>
                <td className="px-4 py-3 font-medium text-ink">{source.label}</td>
                <td className="px-4 py-3 text-slate-600">{source.sourceType}</td>
                <td className="px-4 py-3"><RiskBadge label={statusLabel(source)} /></td>
                <td className="px-4 py-3 text-slate-600">{source.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <SourceNote>{dashboard.dataStatus.sourceNote}</SourceNote>
      </div>
    </SectionCard>
  );
}

