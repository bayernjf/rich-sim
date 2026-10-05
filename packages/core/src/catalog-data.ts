/**
 * T05 · M1 理想生活设计器 Catalog 内容数据。
 *
 * 性质：本文件是**内容数据**，不是投资建议；所有金额为 USD/年、美国全国口径。
 * 全部选项均已用可查证的公开来源校准（2024 数据年，2026-10 校准），`source`
 * 为来源 URL，`note` 写清取值与换算口径；不得把示意数字当事实，改数须同时改来源。
 *
 * 口径：普通人/理想档锚定美国劳工统计局消费者支出调查（BLS CE 2024）全国均值
 * 与最高收入五分位（FRED 托管表），辅以 AAA Your Driving Costs、KFF 雇主医保、
 * NAIS 私校学费、Child Care Aware 托育、Allianz 度假支出、Zillow 租金等；
 * 金额按消费者/家庭**实际自付的年现金支出**计（房贷只计利息、雇主承担的保费
 * 与本金属资产积累均不计入生活费用，与“够用线”口径一致）。
 *
 * 富豪极端档（豪宅/私人飞机/超级游艇/超高端服务）无政府统计，采用行业公开估算，
 * 取值偏保守，`note` 已注明来源性质与区间。
 *
 * 换算口径基准（与 types.ts 的静态 FX 快照一致，1 USD = 0.92 EUR）：
 *   - 50 米超级游艇年运营 400–600 万 EUR，取中值 500 万 EUR ÷ 0.92 ≈ 540 万 USD
 *   - 中型喷气私人飞机按机价 1000 万 USD 估算
 *   - 美国独栋豪宅按评估值 400 万 USD 估算（Money Inc 文章标题锚点）
 */

import type { Catalog } from './types';

/** M1 理想生活设计器目录（USD 口径）。 */
export const initialCatalogUSD: Catalog = {
  currency: 'USD',
  dimensions: [
    // ──────────────────────────────────────────────────────────────────
    // 1. 居住 living
    // ──────────────────────────────────────────────────────────────────
    {
      id: 'living',
      label: '居住',
      options: [
                {
          id: 'small-rental',
          label: '普通两居租房',
          annualCost: 24000,
          source: 'https://www.zillow.com/news/rent-is-ticking-up-but-so-are-the-deals/',
          note: '全国典型挂牌租金约 $1,965/月（Zillow ZORI，2026-07），两居室约 $2,000/月（RentalBeast 2024Q2），年约 $24,000；为含部分水电的 gross rent 口径，都会区更高、中西部与南部更低。',
        },
        {
          id: 'owner-condo',
          label: '自有公寓（房贷+物业+水电）',
          annualCost: 27000,
          source: 'https://fred.stlouisfed.org/release/tables?eid=1213708&rid=479',
          note: 'BLS 消费者支出调查（CE）2024 最高收入五分位：自有住房 Owned Dwellings（房贷利息 $8,850＋房产税 $5,816＋维护/保险/其他 $5,467）约 $20,133，加水电气与电话 $6,607，合计约 $27,000。按 CE 口径只计房贷利息、不含本金偿还（本金属资产积累而非生活费用，与够用线口径一致）；高价城市或把本金计入现金支出时更高。',
          isDefault: true,
          kind: 'consumer',
          joy: 3,
        },
        {
          id: 'luxury-mansion',
          label: '独栋豪宅（房产税+维护）',
          annualCost: 120000,
          source:
            'https://moneyinc.com/the-annual-maintenance-cost-of-a-4-million-luxury-home/',
          note:
            '取自 wealth-lifestyle-framework §4：按豪宅评估值 400 万 USD 估算。' +
            '房产税取加州基础 1%（区间 1–2.5% 的下限锚点）= $40,000；' +
            '房屋维护取房价 1–3% 中值 2% = $80,000（来源：LuxCalculator）。' +
            '合计 $120,000/年，不含房贷本息、佣人、安保与装修翻新。',
          kind: 'asset',
          purchasePrice: 4_000_000,
          costComponents: ['房产税约 $40,000', '维护约 $80,000'],
          joy: 5,
          resellable: true,
          carryingJoy: 0,
        },
      ],
    },

    // ──────────────────────────────────────────────────────────────────
    // 2. 出行 transport
    // ──────────────────────────────────────────────────────────────────
    {
      id: 'transport',
      label: '出行',
      options: [
                {
          id: 'public-transit',
          label: '地铁/公交通勤',
          annualCost: 1600,
          source: 'https://www.bls.gov/opub/reports/consumer-expenditures/2024/home.htm',
          note: 'BLS CE 2024 全国“公共及其他交通”平均 $1,131/年；大城市公交通勤月票约 $130/月（约 $1,600/年，如纽约 MTA $132/月），取 $1,600；不含偶尔打车与城际出行（最高收入五分位此项约 $2,593）。',
        },
        {
          id: 'car-loan',
          label: '家用车（贷款+保险+油+保养）',
          annualCost: 12000,
          source: 'https://newsroom.aaa.com/2024/09/aaa-your-driving-costs-the-price-of-new-car-ownership-continues-to-climb/',
          note: 'AAA《Your Driving Costs 2024》：新车平均持有与使用成本 $12,297/年（年行驶 15,000 英里，含折旧 $4,680、保险 $1,715、融资 $1,332、牌照税 $815 及燃油保养），取 $12,000；二手车成本更低。',
          isDefault: true,
          kind: 'consumer',
          joy: 2,
        },
                {
          id: 'exotic-car',
          label: '豪华车（跑车/大型 SUV，折旧高）',
          annualCost: 17000,
          source: 'https://newsroom.aaa.com/wp-content/uploads/2024/09/YDC_Fact-Sheet-FINAL-9.2024.pdf',
          note: 'AAA 2024 九类主流车型中每英里成本最高约 $1.10/英里（半吨皮卡），按 15,000 英里约 $16,500/年，大型 SUV 约 $12,576，保守取 $17,000。AAA 仅覆盖主流新车、不含超跑/超豪华品牌（其保险与折旧更高且缺权威一手统计），故不采用更高估值。',
          kind: 'asset',
          joy: 5,
          resellable: true,
          carryingJoy: 0,
        },
        {
          id: 'private-jet',
          label: '私人飞机（年运营全口径）',
          annualCost: 1000000,
          source:
            'https://theflyingengineer.com/the-real-cost-of-owning-and-operating-a-private-jet/',
          note:
            '取自 wealth-lifestyle-framework §4：年运营成本约机价 5–15%' +
            '（含机组、机库、保险、油）。按中型喷气机价 1000 万 USD，' +
            '取区间中值 10% = $1,000,000/年。其中机组约 $250,000/年' +
            '（NovaJet 口径）、机库 7–15 万 USD/年、保险机价 1–3%/年，' +
            '均已含在此口径内；不含购机首付与翻新。',
          kind: 'asset',
          purchasePrice: 10_000_000,
          costComponents: ['机组约 $250,000', '机库 $70,000–150,000', '保险（机价 1–3%）', '油与维护'],
          joy: 5,
          resellable: true,
          carryingJoy: -1,
        },
      ],
    },

    // ──────────────────────────────────────────────────────────────────
    // 3. 家庭与子女 family
    // ──────────────────────────────────────────────────────────────────
    {
      id: 'family',
      label: '家庭与子女',
      options: [
                {
          id: 'single-no-kids',
          label: '单身/无子女（人情与节日往来）',
          annualCost: 1200,
          source: 'https://fred.stlouisfed.org/release/tables?eid=1213708&rid=479',
          note: 'BLS CE 2024“现金赠与 Cash Contributions”（含礼金、捐赠、赡养）最高收入五分位为 $5,031/年、全国约 $2,300；单身无子女的人情与节日往来为其子集，保守取 $1,200。',
        },
                {
          id: 'one-child-public',
          label: '一个孩子（公立学区+日常育儿）',
          annualCost: 15000,
          source: 'https://info.childcareaware.org/hubfs/Affordability_Analysis_2024.pdf',
          note: 'Child Care Aware《2024 Price of Care》：全日制中心托育平均约 $13,200–$21,600/年/孩；USDA 中等收入家庭养育一个孩子（0–17 岁，不含大学）经通胀更新后约 $12,000–17,000/年，取 $15,000；未含为好学区购置或租赁房产的溢价。',
          isDefault: true,
        },
                {
          id: 'two-children-private',
          label: '两个孩子（私立学校+课后班）',
          annualCost: 64000,
          source: 'https://www.nais.org/about/parents/learn-about-independent-schools',
          note: 'NAIS（全国独立学校协会）平均走读日校学费 $32,251/年/生，两个孩子约 $64,500，取 $64,000；教区/天主教学校更低（约 $5,000–13,000/年），课后班与夏令营另计。',
          kind: 'consumer',
          joy: 3,
        },
                {
          id: 'elite-education',
          label: '精英寄宿/国际学校+私人 tutor',
          annualCost: 100000,
          source: 'https://www.nais.org/about/parents/learn-about-independent-schools',
          note: 'NAIS 七天制寄宿学校平均学费约 $71,715/年（含食宿），加私人 tutor、课外项目与差旅约 $20,000–30,000，取 $100,000；顶尖寄宿校学费可超 $75,000。',
          kind: 'consumer',
          joy: 4,
        },
      ],
    },

    // ──────────────────────────────────────────────────────────────────
    // 4. 旅行 travel
    // ──────────────────────────────────────────────────────────────────
    {
      id: 'travel',
      label: '旅行',
      options: [
                {
          id: 'staycation',
          label: '国内短途/年假周边',
          annualCost: 2000,
          source: 'https://www.bls.gov/opub/reports/consumer-expenditures/2024/home.htm',
          note: 'BLS CE 2024 全国娱乐支出平均 $3,609/年（最高五分位 $7,660，其中门票与收费 $2,546）；国内短途与年假周边游为其一部分，保守取 $2,000。',
        },
                {
          id: 'international',
          label: '每年一次国际度假',
          annualCost: 8000,
          source: 'https://www.allianzworldwidepartners.com/usa/media-center/press-releases/Global-travel-defies-economic-and-geopolitical-pressure-as-experience-led-holiday-surge.html',
          note: 'Allianz Partners 假日支出调查：全球人均单次假期花费约 $1,841（美国出发者约 $2,700 以上）；一个家庭一次国际度假（2–4 人机票＋住宿）约 $6,000–9,000，取 $8,000。',
          isDefault: true,
          kind: 'experience',
          joy: 4,
          resellable: false,
        },
        {
          id: 'superyacht',
          label: '超级游艇自持（年运营全口径）',
          annualCost: 5400000,
          source: 'https://firstownersreference.com/01-reality-of-ownership',
          note:
            '取自 wealth-lifestyle-framework §4：50 米级超级游艇年运营' +
            '约 400–600 万欧元，船员占 30–40%（为最大单项）。' +
            '取中值 500 万 EUR ÷ 0.92（types.ts 静态 FX）≈ 540 万 USD。' +
            '船体维护船价 1–3%/年、每 5 年翻新 10–30%（SuperYachtReview）' +
            '已含在此运营口径内；不含购船本金与大修意外。',
          kind: 'asset',
          purchasePrice: 280_000_000,
          costComponents: ['船员（约占 30–40%）', '船体维护（船价 1–3%/年）', '停泊与保险', '每 5 年翻新摊提'],
          joy: 5,
          resellable: true,
          carryingJoy: -1,
        },
      ],
    },

    // ──────────────────────────────────────────────────────────────────
    // 5. 保险与医疗 health-insurance
    // ──────────────────────────────────────────────────────────────────
    {
      id: 'health-insurance',
      label: '保险与医疗',
      options: [
                {
          id: 'basic-insurance',
          label: '基础医保+自付门诊',
          annualCost: 5000,
          source: 'https://www.bls.gov/opub/reports/consumer-expenditures/2024/home.htm',
          note: 'BLS CE 2024 全国“医疗保健”现金支出平均 $6,197/年/消费单位（自付保费＋医疗服务＋药品），单身基础档约 $5,000。KFF 2024：雇主单身医保总保费 $8,951，其中雇员自付约 $1,400，雇主承担部分不计入个人生活成本。',
        },
                {
          id: 'family-insurance',
          label: '家庭商业医保（夫妻+子女）',
          annualCost: 10000,
          source: 'https://fred.stlouisfed.org/release/tables?eid=1213708&rid=479',
          note: 'BLS CE 2024 最高收入五分位“医疗保健”现金支出 $9,771/年（自付保费 $6,160＋医疗服务 $2,297＋药品 $957），取 $10,000。KFF 2024 家庭险总保费 $25,572 中雇员自付约 $6,296（其余雇主承担）；若自雇或自购保险无雇主分摊，则接近总保费、成本更高。',
          isDefault: true,
        },
                {
          id: 'concierge-medical',
          label: '私人医生/抗衰/全球医疗',
          annualCost: 30000,
          source: 'https://conciergemedicinetoday.org/2026/09/20/executive-health-hospital-vip-programs-and-concierge-medicine-a-comparative-overview-2/',
          note: '行业综述（引 PartnerMD、Becker Hospital Review、American Journal of Medicine）：标准 concierge 会员约 $2,000–5,000/年、中端 $5,000–10,000、超高端（50–100 人小名单）$15,000–50,000 以上；私人医生＋抗衰＋全球医疗属超高端档，取 $30,000。该细分无政府统计，取区间中值。',
          kind: 'consumer',
          joy: 3,
        },
      ],
    },

    // ──────────────────────────────────────────────────────────────────
    // 6. 餐饮与日常 dining-daily
    // ──────────────────────────────────────────────────────────────────
    {
      id: 'dining-daily',
      label: '餐饮与日常',
      options: [
                {
          id: 'home-cooking',
          label: '自己做饭为主（食材+少量外食）',
          annualCost: 3600,
          source: 'https://www.bls.gov/opub/reports/consumer-expenditures/2024/home.htm',
          note: 'BLS CE 2024 全国“在家食品”平均 $6,224/年/消费单位（平均约 2.5 人）；单人按比例约 $3,600，含少量外食。',
        },
                {
          id: 'mixed-dining',
          label: '工作日快餐+周末外食',
          annualCost: 9600,
          source: 'https://www.bls.gov/opub/reports/consumer-expenditures/2024/home.htm',
          note: 'BLS CE 2024 全国食品支出平均 $10,169/年（在家 $6,224＋外食 $3,945）；单人或两口之家工作日快餐＋周末外食约 $9,600。',
          isDefault: true,
        },
                {
          id: 'fine-dining',
          label: '高档餐厅/商务宴请/私厨',
          annualCost: 30000,
          source: 'https://www.talent.com/salary?job=personal+chef',
          note: 'BLS CE 2024 最高收入五分位“外食”$7,652/年；私人厨师（personal chef）美国中位薪资约 $56,000/年（talent.com，兼职约 $200–750/周）。高档餐厅＋商务宴请＋兼职私厨合计取 $30,000；全职住家私厨成本更高（$60,000 以上）。',
          kind: 'consumer',
          joy: 4,
        },
      ],
    },

    // ──────────────────────────────────────────────────────────────────
    // 7. 其他弹性 flexibility
    // ──────────────────────────────────────────────────────────────────
    {
      id: 'flexibility',
      label: '其他弹性',
      options: [
                {
          id: 'modest-buffer',
          label: '小额弹性（购物/礼物/应急）',
          annualCost: 5000,
          source: 'https://www.bls.gov/opub/reports/consumer-expenditures/2024/home.htm',
          note: 'BLS CE 2024 全国平均：杂项约 $2,072＋个人护理 $978＋衣着约 $1,700，合计约 $4,800/年，取 $5,000 作为购物/礼物/应急弹性。',
        },
                {
          id: 'lifestyle-buffer',
          label: '中等弹性（购物升级/短途犒赏）',
          annualCost: 20000,
          source: 'https://fred.stlouisfed.org/release/tables?eid=1213708&rid=479',
          note: 'BLS CE 2024 最高收入五分位：衣着 $3,872＋个人护理 $1,802＋娱乐 $7,660＋杂项 $2,072，合计约 $15,400/年；含购物升级、爱好与短途犒赏取 $20,000。',
          isDefault: true,
        },
                {
          id: 'discretionary-large',
          label: '大额弹性（管家/司机/收藏/安保）',
          annualCost: 120000,
          source: 'https://www.householdstaff.agency/household-staff-annual-report/',
          note: '私人司机在美国约 $80,000–130,000/年、住家管家约 $60,000–120,000（Morgan & Mallet 家政薪资报告；BLS OEWS 住家保洁中位约 $34,660）。$120,000 约为一名资深全职管家或司机的成本，不含多人团队、安保与收藏品本身。',
          kind: 'consumer',
          joy: 4,
        },
      ],
    },
  ],
};
