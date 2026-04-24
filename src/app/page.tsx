import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gray-800 mb-3">QATalkAI</h1>
        <p className="text-gray-500 mb-8">アウトバウンド電話アンケート・商材訴求システム<br/>AIが自動で電話をかけ、アンケートを実施します。</p>
        <Link
          href="/admin/login"
          className="inline-block px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm"
        >
          管理画面へ
        </Link>
      </div>
    </div>
  )
}
