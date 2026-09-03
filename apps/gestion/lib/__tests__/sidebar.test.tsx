import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from '@/components/sidebar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/gestion',
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('Admin Shell', () => {
  it('renders sidebar with navigation links', () => {
    render(<Sidebar />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Clientes')).toBeInTheDocument()
  })

  it('highlights active route in sidebar', () => {
    render(<Sidebar />)
    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink).toHaveAttribute('href', '/gestion')
  })

  it('renders brand mark', () => {
    render(<Sidebar />)
    expect(screen.getByText('BEIM')).toBeInTheDocument()
    expect(screen.getByText('Panel de Gestión')).toBeInTheDocument()
  })
})
