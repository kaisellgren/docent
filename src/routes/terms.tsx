import { Link, createFileRoute } from '@tanstack/react-router'
import { TopNavigation } from '@/components/navigation'
import * as styles from '@/styles/app.css'

export const Route = createFileRoute('/terms')({ component: TermsPage })

function TermsPage() {
  return (
    <div>
      <TopNavigation viewer={undefined} />
      <main className={styles.shell}>
        <article className={styles.termsPage}>
          <div className={styles.pageBreadcrumb}>
            <Link className={styles.pageBreadcrumbLink} to="/">
              Docent
            </Link>
            <span aria-hidden="true">/</span>
            <span className={styles.pageBreadcrumbCurrent}>Terms of Service</span>
          </div>
          <h1>Terms of Service</h1>
          <p className={styles.muted}>Last updated: July 31, 2026</p>
          <p>
            These Terms of Service govern your use of Docent, an internal knowledge base for organizing, searching, and
            discussing information shared by your organization.
          </p>
          <h2>Use of the service</h2>
          <p>
            Use Docent only for your organization’s legitimate business purposes and in accordance with your
            organization’s policies. You are responsible for keeping your account secure and for the content you add to
            the service.
          </p>
          <h2>Content and access</h2>
          <p>
            Your organization controls the pages, files, and other content stored in its Docent workspace. Access may be
            granted, changed, or revoked by your organization’s administrators.
          </p>
          <h2>Acceptable use</h2>
          <p>
            Do not misuse the service, attempt to gain unauthorized access, upload malicious code, or use Docent in a
            way that violates applicable law or the rights of others.
          </p>
          <h2>Availability and changes</h2>
          <p>
            Docent is provided as an internal service and may change or become unavailable from time to time. We may
            update these terms as the service evolves; continued use after an update means you accept the revised terms.
          </p>
          <h2>Contact</h2>
          <p>Questions about these terms should be directed to your organization’s Docent administrator.</p>
        </article>
      </main>
    </div>
  )
}
