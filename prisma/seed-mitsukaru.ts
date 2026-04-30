import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

// 電話対応用フロー（販促向け）
const phoneFlow = {
  version: 1,
  nodes: [
    {
      id: 'greeting',
      type: 'say',
      text: 'お電話ありがとうございます。在庫管理システム「ミツカル」のご案内窓口でございます。',
    },
    {
      id: 'pitch',
      type: 'say',
      text: 'ミツカルは、QRコードとスマホで現場から簡単に在庫管理ができるクラウドサービスです。発注アラートや製造可能数の自動計算など、中小製造業の在庫管理をAIでサポートいたします。',
    },
    {
      id: 'qa',
      type: 'qa_loop',
      askPrompt: 'ご質問がございましたら、お気軽にどうぞ。',
      rePrompt: '申し訳ございません、もう一度お願いできますでしょうか。',
      confirmTemplate: '「{question}」というご質問でよろしいでしょうか？',
      moreQuestionsPrompt: 'ほかにご質問はございますか？',
      noMoreMatchesPrompt: '申し訳ありません、もう少し詳しくお聞かせいただけますか？',
      maxCandidates: 3,
    },
    {
      id: 'closing',
      type: 'closing',
      text: '詳しい資料をお送りすることも可能です。今後ご連絡をさせていただいてもよろしいでしょうか？',
      collectFreeForm: true,
    },
    {
      id: 'thanks',
      type: 'thanks',
      text: 'ミツカルにご関心をお寄せいただき、ありがとうございました。',
    },
  ],
}

// Web bot用フロー（操作ガイド）
const webFlow = {
  version: 1,
  nodes: [
    {
      id: 'qa',
      type: 'qa_loop',
      askPrompt: 'ミツカルの使い方についてご質問をどうぞ。',
      rePrompt: 'もう一度お話しください。',
      confirmTemplate: '「{question}」というご質問でよろしいでしょうか？',
      moreQuestionsPrompt: 'ほかにご質問はありますか？',
      noMoreMatchesPrompt: '申し訳ありません、別の言い方でお願いできますか？',
      maxCandidates: 3,
    },
  ],
}

// 電話対応用Q&A（販促・導入検討向け）15問
const phoneQaItems = [
  { q: '料金はいくらですか？', a: '初期費用は無料で、月額9,800円からご利用いただけます。ユーザー数無制限のプランもございますので、御社の規模に合わせてご提案いたします。まずは30日間の無料トライアルをお試しください。' },
  { q: '導入までどのくらいかかりますか？', a: 'お申込みから最短1日で利用開始可能です。CSVで既存の部品マスタを一括インポートできますので、現在お使いのExcel台帳があれば、そのまま移行できます。' },
  { q: '無料で試せますか？', a: 'はい、30日間の無料トライアルをご用意しております。クレジットカード不要で、すべての機能をお試しいただけます。トライアル終了後も自動課金されることはありません。' },
  { q: 'スマホだけで使えますか？', a: 'はい、スマートフォンだけで入庫・出庫・棚卸しができます。現場でQRコードをスキャンして、その場で在庫を更新できるので、事務所に戻る手間がなくなります。' },
  { q: 'Excelからの移行は大変ですか？', a: 'いいえ、CSVインポート機能がございますので、現在お使いのExcel台帳をそのまま取り込めます。また、テンプレートCSVをダウンロードして入力することも可能です。インポートでエラーがあった行は画面上でご確認いただけます。' },
  { q: '複数拠点で使えますか？', a: 'はい、クラウドサービスですので、複数拠点でリアルタイムに在庫情報を共有できます。棚の場所を「工場A-ラックB-3段目」のように階層管理でき、拠点ごとの在庫状況も把握できます。' },
  { q: 'セキュリティは大丈夫ですか？', a: 'SSL暗号化通信、ユーザー認証、操作ログの記録に対応しております。データは国内のAWSサーバーに保存され、毎日自動バックアップを実施しております。' },
  { q: 'サポート体制はどうなっていますか？', a: '平日9時から18時のメール・チャットサポートを提供しております。導入初期は操作説明のオンラインミーティングも無料で実施いたします。' },
  { q: '発注管理もできますか？', a: 'はい、安全在庫を設定すると、在庫が少なくなった部品を自動でアラート表示します。発注推奨数も自動計算されますので、発注忘れを防げます。また、仕入れ先ごとの要発注リストもワンクリックでダウンロードできます。' },
  { q: '製造業向けの機能はありますか？', a: 'はい、製品の部品表（BOM）を登録すると、製造可能数を自動計算します。どの部品が足りないかボトルネックも一目でわかります。製造実行ボタンで、一括で在庫を引き落とすことも可能です。' },
  { q: '棚卸しは楽になりますか？', a: 'はい、重量から個数を自動計算する機能がございます。はかりで総重量を量って入力するだけで、箱の重量を差し引いた実数量が自動で算出されます。その場で在庫調整もできます。' },
  { q: '他システムとの連携はできますか？', a: 'CSVでのエクスポート・インポートに対応しております。生産管理システムや購買システムとのデータ連携が可能です。API連携が必要な場合は、別途ご相談ください。' },
  { q: '何人まで使えますか？', a: 'スタンダードプランは5ユーザーまで、プロフェッショナルプランはユーザー数無制限です。現場作業者全員にアカウントを配布しても追加料金はかかりません。' },
  { q: '解約はすぐにできますか？', a: 'はい、いつでもマイページから解約手続きが可能です。最低契約期間はございません。解約後30日間はデータのエクスポートが可能ですので、安心してご利用いただけます。' },
  { q: '他社との違いは何ですか？', a: 'ミツカルの特長は3つございます。1つ目は、スマホでQRスキャンするだけの簡単操作。2つ目は、重量計算や発注アラートなど現場目線のAI機能。3つ目は、中小企業でも導入しやすい月額9,800円からの価格設定です。' },
]

// Web bot用Q&A（操作ガイド・FAQ）20問
const webQaItems = [
  { q: '入庫するにはどうすればいいですか？', a: '在庫一覧画面で対象部品の「入庫」ボタンを押してください。数量と保管する棚を選んで保存すれば完了です。スマホの場合は「部品照会」からQRをスキャンし、「手入力」タブで入庫できます。' },
  { q: '出庫するにはどうすればいいですか？', a: '在庫一覧で対象部品の「出庫」ボタンを押し、数量と引き出す棚を選んで保存します。メモ欄に使用用途を書いておくと、後で履歴を追跡しやすくなります。' },
  { q: '在庫数を直接修正したい場合は？', a: '「在庫調整」機能をお使いください。在庫一覧の対象部品で「調整」ボタンを押し、実測した個数を入力すると、差分が自動計算されて反映されます。監査ログにも記録が残ります。' },
  { q: 'QRコードはどうやって印刷しますか？', a: 'メニューの「QR発行」を開き、印刷したい部品にチェックを入れて「印刷プレビュー」を押してください。ブラウザの印刷機能でA4ラベル用紙に出力できます。' },
  { q: 'QRスキャンがうまく動きません', a: 'カメラの許可が必要です。iOSの場合は「設定」→「Safari」→「カメラ」で許可してください。HTTPSでない環境ではカメラが使えない場合がありますので、その場合は部品名での検索をお使いください。' },
  { q: '新しい部品を登録するには？', a: 'メニューの「新規登録」から、部品名・型番・カテゴリなどを入力して保存してください。部品コードは空欄でOKで、自動でMIT-XXXXの形式で採番されます。' },
  { q: '似た部品を登録するのが面倒です', a: '新規登録画面上部の「テンプレートから複製」プルダウンをお使いください。直近15件の部品からカテゴリ・単重・安全在庫などをコピーして登録を始められます。' },
  { q: '棚を追加したいのですが', a: 'メニューの「ロケーション」から「新規追加」ボタンを押し、ラック名と棚段を入力して保存してください。同じ組み合わせは二重登録できない仕組みになっています。' },
  { q: '部品を別の棚に移すには？', a: '現在の棚から「出庫」、新しい棚に「入庫」の2操作で記録します。メモ欄に「棚移動 A-1→B-2」と書いておくと、履歴上で追跡しやすくなります。' },
  { q: '重量から個数を計算するには？', a: '部品詳細画面の「個数計算機」を使います。測定した総重量を入力すると、箱重量と単重から自動で個数が計算されます。そのまま「この個数で在庫調整」ボタンで反映できます。' },
  { q: '発注アラートの赤・黄・緑の意味は？', a: '赤は安全在庫以下で即発注が必要、黄は安全在庫×1.5以下で発注推奨、緑は適正在庫です。この比率は「設定」画面から変更できます。' },
  { q: '推奨発注数はどう計算されますか？', a: '「安全在庫×目標倍率−現在庫」で算出されます。最小発注単位を下回らないよう補正もされます。目標倍率は初期値2.0で、設定画面から変更可能です。' },
  { q: 'BOM（製品構成）を登録するには？', a: 'メニュー「製品構成」から製品を新規追加し、右ペインの「BOM明細」で部品と員数を行単位で追加してください。保存すると製造可能数が自動計算されます。' },
  { q: '製造実行で一括出庫するには？', a: '製品一覧で「製造実行」を押し、製造数を入力します。各部品の引当先棚を指定して「実行」を押すと、トランザクション内で一括出庫処理されます。' },
  { q: '製造可能数はどう決まりますか？', a: '各構成部品について「合計在庫÷員数」を計算し、その最小値が製造可能数です。バッジをクリックすると、ボトルネック部品が強調表示されます。' },
  { q: 'CSVで在庫をダウンロードしたい', a: '「データ連携」→エクスポートセクション→「全在庫CSVダウンロード」を押してください。発注アラート対象のみ、仕入先台帳などのCSVも用意しています。' },
  { q: '他システムからデータを取り込みたい', a: '「データ連携」のインポートセクションからテンプレートCSVをダウンロードし、列定義に沿ってデータを入力してアップロードしてください。既存レコードは部品コードをキーに更新されます。' },
  { q: '新しいユーザーを追加したい', a: 'admin権限で「設定」→「ユーザー管理」→「新規追加」から、ユーザー名・パスワード・権限（admin/staff）を登録してください。staffはマスタ編集ができない制限付きアカウントです。' },
  { q: 'ダッシュボードの表示を変えたい', a: '「設定」→「ダッシュボード表示設定」で、ウィジェットの表示/非表示とドラッグで並び順を変更できます。この設定は全ユーザー共通で適用されます。' },
  { q: '操作履歴を確認したい', a: 'メニューの「入出庫ログ」で、すべての入庫・出庫・調整の履歴を確認できます。日付・部品・操作者でフィルタリングして検索も可能です。' },
]

async function main() {
  // 電話対応用プロジェクト
  const phoneProject = await prisma.project.upsert({
    where: { shortId: 'mitsu-tel' },
    update: {
      name: 'ミツカル 電話問い合わせ対応',
      description: '在庫管理システム「ミツカル」の販促・導入検討者向け電話応対',
      defaultMode: 'phone',
      phoneFlow: phoneFlow as unknown as Prisma.InputJsonValue,
      webFlow: webFlow as unknown as Prisma.InputJsonValue,
    },
    create: {
      shortId: 'mitsu-tel',
      name: 'ミツカル 電話問い合わせ対応',
      description: '在庫管理システム「ミツカル」の販促・導入検討者向け電話応対',
      defaultMode: 'phone',
      phoneFlow: phoneFlow as unknown as Prisma.InputJsonValue,
      webFlow: webFlow as unknown as Prisma.InputJsonValue,
    },
  })

  // 電話用Q&Aを削除して再作成
  await prisma.qaItem.deleteMany({ where: { projectId: phoneProject.id } })
  for (let i = 0; i < phoneQaItems.length; i++) {
    await prisma.qaItem.create({
      data: {
        projectId: phoneProject.id,
        question: phoneQaItems[i].q,
        answer: phoneQaItems[i].a,
        sortOrder: i,
      },
    })
  }
  console.log(`[seed] Created phone project: ${phoneProject.shortId} with ${phoneQaItems.length} Q&A items`)

  // Web bot用プロジェクト
  const webProject = await prisma.project.upsert({
    where: { shortId: 'mitsu-web' },
    update: {
      name: 'ミツカル 操作ガイドBot',
      description: '在庫管理システム「ミツカル」の使い方・操作方法FAQ',
      defaultMode: 'web',
      phoneFlow: phoneFlow as unknown as Prisma.InputJsonValue,
      webFlow: webFlow as unknown as Prisma.InputJsonValue,
    },
    create: {
      shortId: 'mitsu-web',
      name: 'ミツカル 操作ガイドBot',
      description: '在庫管理システム「ミツカル」の使い方・操作方法FAQ',
      defaultMode: 'web',
      phoneFlow: phoneFlow as unknown as Prisma.InputJsonValue,
      webFlow: webFlow as unknown as Prisma.InputJsonValue,
    },
  })

  // Web用Q&Aを削除して再作成
  await prisma.qaItem.deleteMany({ where: { projectId: webProject.id } })
  for (let i = 0; i < webQaItems.length; i++) {
    await prisma.qaItem.create({
      data: {
        projectId: webProject.id,
        question: webQaItems[i].q,
        answer: webQaItems[i].a,
        sortOrder: i,
      },
    })
  }
  console.log(`[seed] Created web project: ${webProject.shortId} with ${webQaItems.length} Q&A items`)

  console.log('Mitsukaru seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
