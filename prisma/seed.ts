import { PrismaClient, Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import {
  makeBtoBAppointmentFlow,
  makeSimpleQaFlow,
  makeDefaultFlow,
  makeDefaultWebFlow,
  TalkFlow,
} from '../src/lib/talk-flow'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
  const adminPasswordFromEnv = process.env.ADMIN_PASSWORD
  const adminPassword = adminPasswordFromEnv || crypto.randomBytes(12).toString('base64url')
  const passwordHash = await bcrypt.hash(adminPassword, 10)
  const created = await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, passwordHash, name: '管理者' },
  })
  if (!adminPasswordFromEnv && created.createdAt.getTime() === created.updatedAt.getTime()) {
    console.log('====================================================================')
    console.log('[seed] Admin user created with a generated password:')
    console.log(`         Email:    ${adminEmail}`)
    console.log(`         Password: ${adminPassword}`)
    console.log('[seed] SAVE THIS PASSWORD NOW. It will not be shown again.')
    console.log('[seed] To set your own, re-run seed with ADMIN_PASSWORD=... in .env')
    console.log('====================================================================')
  }

  const defaults = [
    { key: 'twilio_account_sid', value: process.env.TWILIO_ACCOUNT_SID || '' },
    { key: 'twilio_auth_token', value: process.env.TWILIO_AUTH_TOKEN || '' },
    { key: 'twilio_phone_number', value: process.env.TWILIO_PHONE_NUMBER || '' },
    { key: 'twilio_live_calls_enabled', value: process.env.TWILIO_LIVE_CALLS_ENABLED || 'false' },
    { key: 'twilio_dtmf_enabled', value: process.env.TWILIO_DTMF_ENABLED || 'false' },
    { key: 'tts_voice', value: 'Polly.Mizuki' },
    { key: 'base_url', value: process.env.BASE_URL || 'http://localhost:3028' },
    { key: 'openai_api_key', value: process.env.OPENAI_API_KEY || '' },
    { key: 'whisper_model', value: 'whisper-1' },
    { key: 'gpt_model', value: 'gpt-4o-mini' },
    { key: 'answer_logic', value: '2' },
    { key: 'openai_tts_model', value: 'tts-1' },
    { key: 'openai_tts_voice', value: 'alloy' },
    { key: 'show_transcription', value: 'true' },
    { key: 'enable_voice_conversation', value: 'true' },
  ]
  for (const s of defaults) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: s,
    })
  }

  // Remove legacy keys that are no longer used.
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['test_mode'] } } })

  await upsertProject({
    shortId: 'btobap',
    name: 'BtoBアポ獲得トーク（デモ）',
    description: 'AIコンタクトセンターサービスのご紹介電話',
    defaultMode: 'phone',
    phoneFlow: makeBtoBAppointmentFlow(),
    webFlow: makeDefaultWebFlow('弊社サービスについてご質問をどうぞ'),
    qaItems: [
      { q: '料金はいくらですか？', a: '月額5万円からのプランをご用意しております。お問い合わせ数に応じてご提案いたします。' },
      { q: '導入までどのくらいかかりますか？', a: '最短で2週間で運用開始可能です。標準的には1ヶ月程度とお考えください。' },
      { q: 'サポート体制は？', a: '平日9時から18時のメール/電話サポート、有償プランで24時間対応が可能です。' },
      { q: '対応言語は？', a: '日本語・英語・中国語に対応しております。' },
      { q: 'セキュリティは大丈夫ですか？', a: 'ISO27001認証を取得しており、データは国内リージョンに暗号化保存しています。' },
      { q: '他社との違いは？', a: 'AI音声合成の自然さと回答DBのカスタマイズ性が強みです。' },
      { q: '無料トライアルはありますか？', a: '2週間の無料トライアルをご提供しております。' },
      { q: '契約期間は？', a: '最低契約期間は6ヶ月からとなっております。' },
      { q: '解約の手続きは？', a: '解約希望月の前月末までに書面またはメールでお知らせください。' },
      { q: '既存システムとの連携は？', a: 'REST API と Webhook をご用意しており、CRM や MA ツールと連携可能です。' },
    ],
  })

  await upsertProject({
    shortId: 'kintai',
    name: 'AI勤怠管理システム',
    description: '勤怠打刻や労務管理に関するQ&A',
    defaultMode: 'web',
    phoneFlow: makeSimpleQaFlow(),
    webFlow: makeDefaultWebFlow('AI勤怠管理についてご質問をどうぞ'),
    qaItems: [
      { q: '打刻はどのようにしますか？', a: 'スマートフォンまたはPCのブラウザからログインし、「出勤」「退勤」ボタンをタップするだけで打刻できます。GPS位置情報による打刻確認にも対応しています。' },
      { q: '残業申請の方法は？', a: '管理画面の「残業申請」メニューから、日付・時間・理由を入力して申請します。上長にリアルタイムで通知が届き、アプリ上で承認・却下が可能です。' },
      { q: '有給休暇の残日数を確認するには？', a: 'マイページの「休暇管理」タブから、有給休暇の残日数・取得履歴・付与予定日をリアルタイムで確認できます。' },
      { q: 'シフトの登録方法を教えてください。', a: '管理者は「シフト管理」画面からドラッグ＆ドロップでシフトを作成できます。AIが過去のパターンから最適なシフトを提案する機能もあります。' },
      { q: 'テレワーク勤務の記録はできますか？', a: 'はい、「勤務場所」設定でテレワークを選択して打刻できます。在宅・サテライトオフィスなど複数の勤務場所を登録可能です。' },
      { q: '月次の勤怠レポートはどこで見られますか？', a: '「レポート」メニューから月次・週次の勤怠レポートをPDFまたはExcelでダウンロードできます。部門別・個人別の集計も可能です。' },
      { q: '打刻を忘れた場合はどうすればいいですか？', a: '「打刻修正申請」から、日付と正しい出退勤時刻を入力して申請してください。上長の承認後に反映されます。' },
      { q: '対応しているブラウザは何ですか？', a: 'Chrome、Safari、Firefox、Edgeの最新版に対応しています。スマートフォンではiOS 15以上、Android 12以上を推奨しています。' },
      { q: '複数拠点での利用は可能ですか？', a: 'はい、拠点ごとに管理者を設定でき、各拠点の勤怠を一元管理できます。拠点間の異動にも柔軟に対応します。' },
      { q: '給与計算システムとの連携はできますか？', a: 'CSV/APIでの連携に対応しています。主要な給与計算ソフト（freee、マネーフォワード、弥生給与など）との連携実績があります。' },
      { q: 'AIによる異常検知とは何ですか？', a: '過去の勤怠パターンをAIが学習し、通常と異なる打刻パターン（深夜残業の急増、打刻忘れの頻発など）を自動検知して管理者にアラートします。' },
      { q: '料金プランを教えてください。', a: 'スタータープラン（1人月額300円）、ビジネスプラン（1人月額500円）、エンタープライズプラン（要見積）の3プランをご用意しています。30日間の無料トライアルもございます。' },
      { q: '導入までにどのくらいの期間がかかりますか？', a: '最短3営業日で導入可能です。初期設定のサポートも無料で提供しております。大規模導入の場合は、専任のサポート担当が対応いたします。' },
      { q: 'セキュリティ対策について教えてください。', a: 'SSL/TLS暗号化通信、二要素認証、IPアドレス制限、操作ログの記録に対応しています。ISO 27001認証を取得済みです。' },
      { q: '36協定の管理はできますか？', a: 'はい、36協定の上限時間を設定すると、残業時間が上限に近づいた際にアラートが表示されます。月次・年次の集計レポートも自動生成されます。' },
      { q: 'フレックスタイム制に対応していますか？', a: 'はい、コアタイム・フレキシブルタイムの設定、清算期間の設定、過不足時間の自動計算に対応しています。' },
      { q: 'スマートフォンアプリはありますか？', a: '現在はWebアプリ（PWA）として提供しており、スマートフォンのホーム画面に追加してアプリのように使えます。ネイティブアプリは2026年下半期リリース予定です。' },
      { q: 'データのバックアップはどうなっていますか？', a: '毎日自動バックアップを実施しており、過去90日分のデータを保持しています。お客様ご自身でもCSVエクスポートによるバックアップが可能です。' },
      { q: 'サポート体制について教えてください。', a: '平日9:00〜18:00のメール・チャットサポートを提供しています。ビジネスプラン以上では電話サポートもご利用いただけます。' },
      { q: '他社システムからの移行は可能ですか？', a: 'CSV形式でのデータインポートに対応しており、主要な勤怠管理システムからの移行をサポートしています。移行支援サービス（有料）もございます。' },
    ],
  })

  await upsertProject({
    shortId: 'survey',
    name: '満足度アンケート（デモ）',
    description: 'qatalkai 旧互換の短いアンケート',
    defaultMode: 'phone',
    phoneFlow: makeDefaultFlow(),
    webFlow: makeDefaultWebFlow('アンケートにご協力ください'),
    qaItems: [
      { q: 'サービスに満足していますか？', a: 'ご回答ありがとうございます。引き続き改善に努めます。' },
      { q: 'おすすめしたいですか？', a: 'ご意見ありがとうございます。' },
    ],
  })

  await upsertProject({
    shortId: 'train01',
    name: '製造業DX提案ロープレ（初級）',
    description: '新人営業が中堅製造業の情シス担当に自社SaaSを説明するシーンのトレーニング',
    defaultMode: 'training',
    trainingQuestionCount: 3,
    phoneFlow: makeSimpleQaFlow(),
    webFlow: makeDefaultWebFlow('営業トレーニング'),
    qaItems: [
      { q: '御社のサービスは既存の基幹システムとどのように連携できますか？', a: 'REST API と GraphQL の両対応で、主要 ERP/CRM 向けの標準コネクタを30種類ご用意しています。標準コネクタで対応できない場合も、弊社の技術チームが伴走しカスタム連携を実装します。導入実績として、SAP・Oracle・kintone・Salesforce との連携があります。' },
      { q: '年間のコストはどれくらいを見込めばよいでしょうか？', a: 'ID数に応じた従量課金で、初期費用100万円＋ID単価 月額5,000円が標準です。ID100名の場合、年間で約700万円(初期100万＋月50万×12)となります。ボリュームディスカウント、年契約による割引も別途ご相談可能です。' },
      { q: 'セキュリティ認証は取得されていますか？', a: 'ISO27001、SOC2 Type2、プライバシーマークを取得済みです。また、年1回の第三者ペネトレーションテストを実施し、レポートは NDA 締結のうえ開示可能です。' },
      { q: '同規模の製造業での導入事例はありますか？', a: '従業員300名〜500名規模の製造業で3社の導入実績があり、いずれも導入期間3ヶ月で、初年度に工数削減30%・問い合わせ対応時間50%削減の成果が出ています。事例集を別途ご提供できます。' },
      { q: '他社の類似サービス(競合B社)との違いは何ですか？', a: '導入スピード(平均3ヶ月 vs 競合6ヶ月)、専任CSによる伴走サポート、純日本語UIと和製ベンダー直サポート、そして価格優位性(ID単価比で約20%安価)の4点が主な違いです。' },
      { q: '障害時のSLAはどうなっていますか？', a: 'サービス稼働率99.9%を保証しており、未達時は月額の返金ポリシーを適用します。24時間365日の監視体制で、重大障害時は1時間以内に一次回答、4時間以内に復旧対応を開始します。' },
      { q: 'オンプレミスでの運用は可能でしょうか？', a: '原則としてマルチテナント SaaS でのご提供ですが、ご要件に応じて専用VPCでのシングルテナント運用、閉域網接続(AWS PrivateLink/Azure ExpressRoute)にも対応可能です。こちらは要見積となります。' },
      { q: 'データはどこに保存されますか？', a: '国内の AWS 東京リージョンに保存し、複数アベイラビリティゾーンで冗長化しています。バックアップは30日間保持し、日次で差分バックアップを取得しています。海外にデータが出ることはありません。' },
      { q: '無料のトライアル(PoC)はできますか？', a: '2週間の無料PoCをご提供しております。PoC期間中は専任のカスタマーサクセス担当がハンズオンでサポートし、初期設定・データインポート・主要ユースケースの検証までを伴走します。' },
      { q: '解約する場合、データの返却はしてもらえますか？', a: 'CSV または JSON 形式でのデータエクスポートを無償で提供します。契約終了から30日間はエクスポート用の閲覧専用アカウントを維持し、期間経過後は完全削除の上、削除証明書を発行いたします。' },
    ],
  })

  await upsertProject({
    shortId: 'train02',
    name: '価格交渉・反論対応ドリル（中級）',
    description: '新人が詰まりやすい価格交渉・他社比較・セキュリティ懸念などへの反論対応トレーニング',
    defaultMode: 'training',
    trainingQuestionCount: 5,
    phoneFlow: makeSimpleQaFlow(),
    webFlow: makeDefaultWebFlow('営業トレーニング'),
    qaItems: [
      { q: '正直、B社の見積の方が30%安いのですが、それでも御社を選ぶ理由はありますか？', a: '価格差の背景には、提供される付帯サービスの範囲と運用コスト(TCO)の違いがあります。弊社は専任CSによる伴走・標準コネクタ30種の無償提供・24時間サポートを含んでおり、導入後の運用工数を含めた3年TCOではB社より優位になるケースが多いです。具体的な比較シミュレーションを御社の要件でお出しします。' },
      { q: '予算の関係で来期以降の検討にしたいのですが、今期中に決めるメリットはありますか？', a: '今期中のご契約であれば、初期費用の20%ディスカウントと、3ヶ月無償オンボーディング(通常は有償90万円)が適用できます。また、早期着手により年度末の業務繁忙期に間に合わせる運用立ち上げが可能です。' },
      { q: 'クラウドに重要データを置くことに情シス内で反対意見があります。どう説明すればよいですか？', a: 'ISO27001・SOC2 Type2 認証、国内リージョン限定、専用VPC接続オプションなど、オンプレ同等以上のセキュリティ要件を満たすことをお伝えできます。他の製造業での導入事例と、監査対応用のコンプライアンスパックもご提供します。現物の資料で情シス様と直接ディスカッションさせていただくことも可能です。' },
      { q: '決裁が部長までしか下りておらず、経営会議を通すには定量効果が必要です。材料はありますか？', a: '同規模製造業3社の導入効果として、問い合わせ対応工数30%削減、年間500時間の工数削減(人件費換算で約300万円)、平均回答時間50%短縮の実績データをご提供できます。御社の現状数値を教えていただければ、個別の効果試算もお出しします。' },
      { q: '現場の従業員が新ツールの学習に時間を取られるのが心配です。どう解決しますか？', a: '主要操作は5画面以内で完結し、初回チュートリアル5分で業務開始可能な設計です。ハンズオン研修(1時間×2回)、ビデオ教材、チャットサポートをパッケージに含めており、導入企業の平均でも学習完了まで1週間以内です。' },
      { q: '御社は創業が新しく、サービスが5年後も続いている保証がありません。継続性の根拠は？', a: '直近の資金調達でシリーズB・30億円を完了しており、少なくとも今後4年の運用資金を確保しています。また、契約書上にエスクロー条項(仮に事業継続が困難な場合のデータ受け渡し・移行支援)を盛り込んだ契約も可能です。' },
      { q: '稟議で「他社比較表」の提出が必要です。何を出せば通しやすいですか？', a: '弊社から主要3社との比較表(機能・価格・サポート・導入期間の4軸)、導入実績リスト、御社要件に合わせたRFP回答ドラフトをご提供できます。稟議書ドラフトの添削も可能です。稟議通過率を高めた事例もいくつか共有します。' },
      { q: 'PoCで良い結果が出なかった場合、違約金は発生しますか？', a: 'PoCは完全無償で、期間終了後のご判断で本契約不要としていただいて構いません。違約金は一切発生しません。PoC結果レポートは弊社で作成しご提供するため、社内共有用資料としてもご活用いただけます。' },
    ],
  })

  const btob = await prisma.project.findUnique({ where: { shortId: 'btobap' } })
  if (btob) {
    const existingLeads = await prisma.lead.findMany({ where: { projectId: btob.id, phoneNumber: { not: null } } })
    if (existingLeads.length === 0) {
      for (const lead of [
        { phoneNumber: '00000000001', displayName: 'テスト太郎' },
        { phoneNumber: '00000000002', displayName: 'テスト花子' },
      ]) {
        await prisma.lead.create({
          data: {
            projectId: btob.id,
            phoneNumber: lead.phoneNumber,
            displayName: lead.displayName,
            callStatus: 'PENDING',
          },
        })
      }
    }
  }

  console.log('Seed complete.')
}

async function upsertProject(opts: {
  shortId: string
  name: string
  description: string
  defaultMode: string
  phoneFlow: TalkFlow
  webFlow: TalkFlow
  qaItems: { q: string; a: string }[]
  trainingQuestionCount?: number
}) {
  const existing = await prisma.project.findUnique({ where: { shortId: opts.shortId } })
  if (existing) {
    await prisma.project.update({
      where: { id: existing.id },
      data: {
        phoneFlow: opts.phoneFlow as unknown as Prisma.InputJsonValue,
        webFlow: opts.webFlow as unknown as Prisma.InputJsonValue,
        name: opts.name,
        description: opts.description,
        defaultMode: opts.defaultMode,
        ...(typeof opts.trainingQuestionCount === 'number'
          ? { trainingQuestionCount: opts.trainingQuestionCount }
          : {}),
      },
    })
    await prisma.qaItem.deleteMany({ where: { projectId: existing.id } })
    for (let i = 0; i < opts.qaItems.length; i++) {
      await prisma.qaItem.create({
        data: {
          projectId: existing.id,
          question: opts.qaItems[i].q,
          answer: opts.qaItems[i].a,
          sortOrder: i,
        },
      })
    }
    return existing
  }
  const project = await prisma.project.create({
    data: {
      shortId: opts.shortId,
      name: opts.name,
      description: opts.description,
      defaultMode: opts.defaultMode,
      phoneFlow: opts.phoneFlow as unknown as Prisma.InputJsonValue,
      webFlow: opts.webFlow as unknown as Prisma.InputJsonValue,
      ...(typeof opts.trainingQuestionCount === 'number'
        ? { trainingQuestionCount: opts.trainingQuestionCount }
        : {}),
    },
  })
  for (let i = 0; i < opts.qaItems.length; i++) {
    await prisma.qaItem.create({
      data: {
        projectId: project.id,
        question: opts.qaItems[i].q,
        answer: opts.qaItems[i].a,
        sortOrder: i,
      },
    })
  }
  return project
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
