import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CategoryNav } from './CategoryNav'
import type { Category } from '@beim/contracts'

const categories: Category[] = [
  {
    id: 'cat-1',
    name: 'Celulares',
    code: 'CEL',
    description: 'Phones',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'cat-2',
    name: 'Accesorios',
    code: 'ACC',
    description: 'Accessories',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

describe('CategoryNav', () => {
  it('renders all category names', () => {
    render(<CategoryNav categories={categories} />)
    expect(screen.getByText('Celulares')).toBeInTheDocument()
    expect(screen.getByText('Accesorios')).toBeInTheDocument()
  })

  it('renders links with correct hrefs', () => {
    render(<CategoryNav categories={categories} />)
    expect(screen.getByText('Celulares').closest('a')).toHaveAttribute('href', '/categoria/cat-1')
    expect(screen.getByText('Accesorios').closest('a')).toHaveAttribute('href', '/categoria/cat-2')
  })

  it('renders empty state when no categories', () => {
    render(<CategoryNav categories={[]} />)
    expect(screen.getByText('Todos')).toBeInTheDocument()
  })

  it('always includes "Todos" link to home', () => {
    render(<CategoryNav categories={categories} />)
    const todosLink = screen.getByText('Todos').closest('a')
    expect(todosLink).toHaveAttribute('href', '/')
  })
})
