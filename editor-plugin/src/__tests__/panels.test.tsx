import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkflowStore } from '../../../src/stores/workflowStore.ts';
import PlaytestLauncher from '../panels/PlaytestLauncher.tsx';
import CardDesigner from '../panels/CardDesigner.tsx';

// --- PlaytestLauncher ---

describe('PlaytestLauncher', () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      nodes: [],
      edges: [],
      validationErrors: [],
      nodeValidationErrors: {},
    });
    vi.clearAllMocks();
  });

  it('renders the launch button', () => {
    render(<PlaytestLauncher serverUrl="http://localhost:9090" />);
    expect(screen.getByRole('button', { name: /playtest/i })).toBeTruthy();
  });

  it('shows empty graph warning when no nodes present', async () => {
    render(<PlaytestLauncher serverUrl="http://localhost:9090" />);
    fireEvent.click(screen.getByRole('button', { name: /playtest/i }));
    await waitFor(() => {
      expect(screen.getByText(/no game nodes/i)).toBeTruthy();
    });
  });

  it('compiles graph and calls POST when nodes are present', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ gameId: 'game-123' }), { status: 200 }),
    );

    useWorkflowStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'game.deck',
          position: { x: 0, y: 0 },
          data: { moduleType: 'game.deck', label: 'Player Deck', config: { maxCards: 60 } },
        },
      ],
      edges: [],
    });

    render(<PlaytestLauncher serverUrl="http://localhost:9090" />);
    fireEvent.click(screen.getByRole('button', { name: /playtest/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:9090/api/game/start',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows game ID after successful launch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ gameId: 'game-abc' }), { status: 200 }),
    );

    useWorkflowStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'game.deck',
          position: { x: 0, y: 0 },
          data: { moduleType: 'game.deck', label: 'Deck', config: {} },
        },
      ],
      edges: [],
    });

    render(<PlaytestLauncher serverUrl="http://localhost:9090" />);
    fireEvent.click(screen.getByRole('button', { name: /playtest/i }));

    await waitFor(() => {
      expect(screen.getByText(/game-abc/)).toBeTruthy();
    });
  });

  it('shows error message when server POST fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Server Error', { status: 500 }),
    );

    useWorkflowStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'game.deck',
          position: { x: 0, y: 0 },
          data: { moduleType: 'game.deck', label: 'Deck', config: {} },
        },
      ],
      edges: [],
    });

    render(<PlaytestLauncher serverUrl="http://localhost:9090" />);
    fireEvent.click(screen.getByRole('button', { name: /playtest/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed/i)).toBeTruthy();
    });
  });

  it('opens game client in new window after successful launch', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ gameId: 'game-xyz' }), { status: 200 }),
    );

    useWorkflowStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'game.deck',
          position: { x: 0, y: 0 },
          data: { moduleType: 'game.deck', label: 'Deck', config: {} },
        },
      ],
      edges: [],
    });

    render(<PlaytestLauncher serverUrl="http://localhost:9090" />);
    fireEvent.click(screen.getByRole('button', { name: /playtest/i }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        'http://localhost:9090/play/game-xyz',
        '_blank',
      );
    });
  });

  it('accepts optional onLaunch callback', async () => {
    const onLaunch = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ gameId: 'g1' }), { status: 200 }),
    );

    useWorkflowStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'game.deck',
          position: { x: 0, y: 0 },
          data: { moduleType: 'game.deck', label: 'Deck', config: {} },
        },
      ],
      edges: [],
    });

    render(<PlaytestLauncher serverUrl="http://localhost:9090" onLaunch={onLaunch} />);
    fireEvent.click(screen.getByRole('button', { name: /playtest/i }));
    await waitFor(() => expect(onLaunch).toHaveBeenCalledWith('g1'));
  });
});

// --- CardDesigner ---

describe('CardDesigner', () => {
  it('renders the card designer panel', () => {
    render(<CardDesigner />);
    expect(screen.getByText(/card designer/i)).toBeTruthy();
  });

  it('shows default card type selector', () => {
    render(<CardDesigner />);
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('shows creature as default card type', () => {
    render(<CardDesigner />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('creature');
  });

  it('renders card name input', () => {
    render(<CardDesigner />);
    expect(screen.getByPlaceholderText(/card name/i)).toBeTruthy();
  });

  it('renders cost input', () => {
    render(<CardDesigner />);
    expect(screen.getByLabelText(/cost/i)).toBeTruthy();
  });

  it('calls onChange when card name is updated', () => {
    const onChange = vi.fn();
    render(<CardDesigner onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(/card name/i), { target: { value: 'Dragon' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dragon' }));
  });

  it('calls onChange when card type is changed', () => {
    const onChange = vi.fn();
    render(<CardDesigner onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'spell' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cardType: 'spell' }));
  });

  it('shows a card preview section', () => {
    render(<CardDesigner />);
    expect(screen.getByText(/preview/i)).toBeTruthy();
  });

  it('accepts initialCard prop to pre-populate fields', () => {
    render(<CardDesigner initialCard={{ name: 'Fire Drake', cardType: 'creature', cost: 4, effects: [] }} />);
    const nameInput = screen.getByPlaceholderText(/card name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Fire Drake');
  });
});
