export type StockMetadata = {
  ticker: string;
  name: string;
  sector: string;
  description: string;
};

export const stockMetadataList: StockMetadata[] = [
  {
    ticker: "BA.L",
    name: "BAE Systems plc",
    sector: "Aerospace & Defense",
    description: "Defense-prime research cockpit focused on backlog durability, long-cycle programmes, defence-budget scenarios, cash conversion, and valuation triangulation.",
  },
  {
    ticker: "MCK",
    name: "McKesson",
    sector: "Healthcare Distribution / Specialty Oncology / Rx Technology",
    description:
      "Healthcare distribution research cockpit focused on specialty oncology, Rx technology, cash conversion, capital allocation, and valuation triangulation.",
  },
  {
    ticker: "LSEG",
    name: "London Stock Exchange Group",
    sector: "Financial Market Infrastructure / Data & Workflow",
    description:
      "LSEG buy-side research cockpit focused on data/workflow durability, FTSE Russell, Tradeweb, post-trade, Workspace monetization, capital return, and valuation integrity.",
  },
  { ticker: "AZN", name: "AstraZeneca", sector: "Global Biopharmaceuticals / Oncology / Rare Disease / CVRM", description: "AstraZeneca research cockpit focused on therapy-area durability, pipeline conversion, patent cliffs, China exposure, and valuation." },
  { ticker: "AMZN", name: "Amazon.com, Inc.", sector: "Cloud Infrastructure / E-commerce / Advertising / Subscription Flywheel", description: "Amazon research cockpit focused on AWS, retail margin, ads, Prime, logistics leverage, capex intensity, and valuation." },
  { ticker: "NVDA", name: "NVIDIA Corporation", sector: "AI Infrastructure Semiconductors / Accelerated Computing / Networking", description: "NVIDIA research cockpit focused on accelerator demand, networking, supply, margins, customer concentration, and AI infrastructure valuation." },
  {
    ticker: "ASML",
    name: "ASML Holding N.V.",
    sector: "AI Infrastructure / Semiconductor Equipment / Lithography",
    description:
      "ASML research cockpit focused on EUV and High-NA demand durability, AI semiconductor capex, China export restrictions, backlog support, gross margin, FCF conversion, and premium multiple resilience.",
  },
  {
    ticker: "AAPL",
    name: "Apple Inc.",
    sector: "Consumer Technology / Ecosystem / Services",
    description:
      "Apple buy-side research cockpit focused on iPhone replacement demand, Services mix and regulation, installed-base monetization, China risk, Apple Intelligence optionality, capital return, and valuation triangulation.",
  },
  {
    ticker: "MA",
    name: "Mastercard Inc.",
    sector: "Payments Network / Financial Technology",
    description:
      "Mastercard buy-side research cockpit focused on cross-border volume, switched transactions, gross dollar volume, value-added services, take-rate stability, regulation, alternative rails, FCF conversion, buybacks, and premium multiple durability.",
  },
  {
    ticker: "V",
    name: "Visa Inc.",
    sector: "Payments Network / Financial Technology",
    description:
      "Visa buy-side research cockpit focused on cross-border volume, switched transactions, gross dollar volume, value-added services, take-rate stability, regulation, alternative rails, FCF conversion, buybacks, and premium multiple durability.",
  },
  {
    ticker: "NOW",
    name: "ServiceNow Inc.",
    sector: "Enterprise Software / Workflow Automation",
    description:
      "ServiceNow buy-side research cockpit focused on workflow platform durability, subscription growth, agentic AI monetization, backlog conversion, margins, and valuation.",
  },
  {
    ticker: "ANET",
    name: "Arista Networks Inc.",
    sector: "AI Networking / Ethernet Infrastructure",
    description:
      "Arista buy-side research cockpit focused on AI networking clusters, cloud titan demand, Ethernet share gain, campus optionality, margins, and valuation.",
  },
  {
    ticker: "MSFT",
    name: "Microsoft Corporation",
    sector: "AI Platform / Cloud Infrastructure / Enterprise Software",
    description:
      "Microsoft AI platform buy-side research cockpit focused on Azure AI capacity, OpenAI exposure, Copilot monetization, margin bridge, capex/FCF payback, business mix, risks, and valuation triangulation.",
  },
  { ticker: "GOOGL", name: "Alphabet Inc.", sector: "Search / YouTube / Cloud / AI Infrastructure", description: "Alphabet research cockpit focused on Search, YouTube, Cloud, AI infrastructure, regulatory risk, and valuation." },
  { ticker: "META", name: "Meta Platforms, Inc.", sector: "Internet Advertising / AI Infrastructure / Social Platforms", description: "Buy-side research cockpit for META ad economics, AI monetization, capex-to-ROIC, product engagement, regulatory risk, and Reality Labs option value." },
  { ticker: "PLTR", name: "Palantir Technologies", sector: "AI Software / Ontology / Mission-Critical Operations", description: "Palantir research cockpit focused on AIP adoption, commercial expansion, government durability, ontology moat, margin scale, and valuation." },
  { ticker: "ISRG", name: "Intuitive Surgical", sector: "Medical Devices / Robotic Surgery Platform", description: "Intuitive Surgical research cockpit focused on procedures, installed base, da Vinci 5 cycle, recurring revenue, China, margin durability, and valuation." },
  { ticker: "NOC", name: "Northrop Grumman Corporation", sector: "Aerospace & Defense", description: "Defense-prime research cockpit focused on B-21, Sentinel, Space Systems, Mission Systems, backlog conversion, cash flow, and valuation." },
  { ticker: "RTX", name: "RTX Corporation", sector: "Aerospace & Defense", description: "Defense-prime and commercial aerospace research cockpit focused on backlog, GTF execution, Raytheon missile defense, cash conversion, and valuation triangulation." },
  { ticker: "LMT", name: "Lockheed Martin Corporation", sector: "Aerospace & Defense", description: "Defense-prime research cockpit focused on F-35 cadence, missile-defense demand, backlog conversion, program-charge risk, cash conversion, and valuation triangulation." },
  { ticker: "LEGN", name: "Legend Biotech", sector: "Biotechnology / Autologous Cell Therapy / Multiple Myeloma", description: "Legend Biotech research cockpit focused on Carvykti commercialization, manufacturing access, label expansion, collaboration economics, pipeline optionality, and valuation." },
  { ticker: "BMY", name: "Bristol Myers Squibb", sector: "Biopharma / Hematology / Immunology / Cardiovascular", description: "Biopharma research cockpit focused on portfolio durability, LOE risk, pipeline replacement, cash flow, and valuation." },
  { ticker: "GILD", name: "Gilead Sciences", sector: "Biopharma / HIV / Oncology / Liver Disease", description: "Biopharma research cockpit focused on HIV durability, oncology execution, pipeline replacement, capital return, and valuation." },
  { ticker: "AUTL", name: "Autolus Therapeutics", sector: "Biotechnology / Cell Therapy", description: "Biopharma research cockpit focused on obe-cel launch, manufacturing, clinical evidence, financing risk, and valuation." },
  { ticker: "TSM", name: "Taiwan Semiconductor Manufacturing Company", sector: "Semiconductor Foundry / Advanced Nodes / AI Infrastructure Supply Chain", description: "TSMC research cockpit focused on advanced node demand, AI/HPC mix, gross margin, capex, geopolitics, and valuation." },
  { ticker: "CEG", name: "Constellation Energy Corporation", sector: "Power / Nuclear / AI Data-Center Infrastructure", description: "Constellation Energy research cockpit focused on nuclear fleet scarcity, AI data-center power demand, merchant power-price exposure, PTC downside support, regulation, normalized FCF, and valuation." },
  { ticker: "DGE.L", name: "Diageo plc", sector: "Global Beverages / Spirits / Beer / Premium & Mainstream Consumer Staples", description: "Diageo research cockpit focused on spirits category normalization, U.S. inventory reset, emerging markets, margins, cash flow, and valuation." },
  { ticker: "TRI", name: "Thomson Reuters Corporation", sector: "Professional Information / Legal Tech / AI Workflow", description: "Thomson Reuters research cockpit focused on legal/workflow AI, recurring revenue, margin durability, capital allocation, and valuation." },
];
