import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BreadcrumbBar } from './BreadcrumbBar.tsx';

describe('BreadcrumbBar', () => {
  const defaultProps = {
    rootFile: 'app.yaml',
    currentFile: 'domains/auth.yaml',
    currentSection: 'login pipeline',
    onNavigate: vi.fn(),
  };

  beforeEach(() => {
    defaultProps.onNavigate.mockClear();
  });

  it('renders root file segment', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    expect(screen.getByText('app.yaml')).toBeInTheDocument();
  });

  it('renders directory segments from path', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    expect(screen.getByText('domains')).toBeInTheDocument();
  });

  it('renders current file segment', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    expect(screen.getByText('auth.yaml')).toBeInTheDocument();
  });

  it('renders current section when provided', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    expect(screen.getByText('login pipeline')).toBeInTheDocument();
  });

  it('clicking root file calls onNavigate with root path', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    fireEvent.click(screen.getByText('app.yaml'));
    expect(defaultProps.onNavigate).toHaveBeenCalledWith('app.yaml', null);
  });

  it('clicking a directory is a no-op', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    fireEvent.click(screen.getByText('domains'));
    expect(defaultProps.onNavigate).not.toHaveBeenCalled();
  });

  it('clicking current file calls onNavigate with file path', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    fireEvent.click(screen.getByText('auth.yaml'));
    expect(defaultProps.onNavigate).toHaveBeenCalledWith('domains/auth.yaml', null);
  });

  it('renders unknown parent indicator when rootFile is null', () => {
    render(<BreadcrumbBar {...defaultProps} rootFile={null} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders separator between segments', () => {
    render(<BreadcrumbBar {...defaultProps} />);
    const separators = screen.getAllByText('›');
    expect(separators.length).toBeGreaterThan(0);
  });

  it('renders only root when currentFile is null', () => {
    render(<BreadcrumbBar {...defaultProps} currentFile={null} currentSection={undefined} />);
    expect(screen.getByText('app.yaml')).toBeInTheDocument();
    expect(screen.queryByText('domains')).not.toBeInTheDocument();
  });
});
