import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
	type ReactElement,
} from "react";
import type {HandView} from "../game/bridge.js";

/** React types `style` as CSSProperties, which leaves no room for the custom properties the card's CSS reads. */
type CardStyle = CSSProperties & {"--ec": string; "--strip": string};

/** What a card being carried has to remember between the press and the release. */
interface Drag {
	readonly uid: number;
	readonly el: HTMLButtonElement;
	readonly x0: number;
	readonly y0: number;
	readonly pid: number;
	/** False until the pointer has moved far enough for this to count as a drag at all. */
	active: boolean;
	/** True for anything but a mouse, where a sideways swipe belongs to the scroller. */
	readonly touch: boolean;
}

/** Where a drop would land: the place in the hand, and the card the marker goes on. */
interface Drop {
	readonly idx: number;
	readonly uid: number | null;
	readonly side: "slotL" | "slotR";
}

/**
 * The hand at the foot of the board: the strip of cards, the arrows and thumb that scroll it, and
 * the dragging that puts a card somewhere else in the hand. The strip is the only thing here that
 * is measured rather than told, so its scrolling is read straight off the DOM.
 */
export function Hand({view}: {readonly view: HandView}): ReactElement {
	const strip = useRef<HTMLDivElement | null>(null);
	const bar = useRef<HTMLDivElement | null>(null);
	const thumb = useRef<HTMLDivElement | null>(null);
	const cards = useRef(new Map<number, HTMLButtonElement>());
	const drag = useRef<Drag | null>(null);
	const barDrag = useRef(false);
	const justDragged = useRef(false);
	// the window listeners are hung once, so the newest view is left somewhere they can find it
	const latest = useRef(view);
	const [ends, setEnds] = useState({start: true, end: true});
	const [thumbAt, setThumbAt] = useState({w: 40, left: 0});
	const [lift, setLift] = useState<{uid: number; dx: number; dy: number} | null>(null);
	const [slot, setSlot] = useState<{uid: number; side: "slotL" | "slotR"} | null>(null);

	/** How far along the strip is: which arrows are spent, and how wide and far over the thumb sits. */
	const measure = useCallback((): void => {
		const box = strip.current;
		const track = bar.current;
		if (box === null || track === null) return;
		const room = box.scrollWidth - box.clientWidth;
		setEnds({start: box.scrollLeft <= 1, end: box.scrollLeft >= room - 1});
		const width = track.clientWidth > 0 ? track.clientWidth : 1;
		const ratio = box.scrollWidth > 0 ? Math.min(1, box.clientWidth / box.scrollWidth) : 1;
		const w = Math.max(40, Math.round(width * ratio));
		const spare = Math.max(0, room);
		setThumbAt({w, left: spare > 0 ? Math.round((box.scrollLeft / spare) * (width - w)) : 0});
	}, []);

	/** Scrubs the strip to wherever the thumb has been dropped, with the thumb held under the pointer. */
	const barTo = useCallback(
		(clientX: number): void => {
			const box = strip.current;
			const track = bar.current;
			const th = thumb.current;
			if (box === null || track === null || th === null) return;
			const r = track.getBoundingClientRect();
			const w = th.offsetWidth;
			const run = r.width - w;
			const want = Math.max(0, Math.min(run, clientX - r.left - w / 2));
			const room = Math.max(0, box.scrollWidth - box.clientWidth);
			box.scrollLeft = run > 0 ? (want / run) * room : 0;
			measure();
		},
		[measure],
	);

	/** The place a card let go of here would take, counted among the cards it left behind. */
	const dropIndex = useCallback((clientX: number, uid: number): Drop => {
		const others = latest.current.cards.filter((c) => c.uid !== uid);
		for (const [k, other] of others.entries()) {
			const el = cards.current.get(other.uid);
			if (el === undefined) continue;
			const r = el.getBoundingClientRect();
			if (clientX < r.left + r.width / 2) return {idx: k, uid: other.uid, side: "slotL"};
		}
		const last = others.at(-1);
		return {idx: others.length, uid: last === undefined ? null : last.uid, side: "slotR"};
	}, []);

	useEffect(() => {
		latest.current = view;
	});

	// the strip's own scrolling, a change of width and a fresh hand all move the arrows and the thumb
	useEffect(() => {
		const box = strip.current;
		measure();
		box?.addEventListener("scroll", measure, {passive: true});
		window.addEventListener("resize", measure);
		return () => {
			box?.removeEventListener("scroll", measure);
			window.removeEventListener("resize", measure);
		};
	}, [measure, view.cards]);

	// a drag follows the pointer well past the card it began on, so the window is what gets listened to
	useEffect(() => {
		const move = (e: PointerEvent): void => {
			if (barDrag.current) barTo(e.clientX);
			const d = drag.current;
			if (d === null || e.pointerId !== d.pid) return;
			const dx = e.clientX - d.x0;
			const dy = e.clientY - d.y0;
			if (!d.active) {
				if (Math.hypot(dx, dy) < 8) return;
				// on touch, a sideways swipe belongs to the scroller, not to us
				if (d.touch && Math.abs(dx) > Math.abs(dy)) {
					drag.current = null;
					return;
				}
				d.active = true;
				try {
					d.el.setPointerCapture(d.pid);
				} catch {
					// a pointer that has already gone is nothing to worry about
				}
			}
			e.preventDefault();
			setLift({uid: d.uid, dx, dy});
			// a card carried to either end of the strip drags the strip along under it
			const box = strip.current;
			if (box !== null) {
				const r = box.getBoundingClientRect();
				if (e.clientX < r.left + 44) box.scrollLeft -= 14;
				else if (e.clientX > r.right - 44) box.scrollLeft += 14;
			}
			const to = dropIndex(e.clientX, d.uid);
			setSlot(to.uid === null ? null : {uid: to.uid, side: to.side});
		};
		const up = (e: PointerEvent): void => {
			barDrag.current = false;
			const d = drag.current;
			if (d === null || e.pointerId !== d.pid) return;
			drag.current = null;
			setLift(null);
			setSlot(null);
			if (!d.active) return;
			// letting go fires a click on the card the drag began on, and that click is not a pick
			justDragged.current = true;
			latest.current.reorder(d.uid, dropIndex(e.clientX, d.uid).idx);
		};
		window.addEventListener("pointermove", move, {passive: false});
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
		return () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
		};
	}, [barTo, dropIndex]);

	const scrollStrip = (dir: number): void => {
		const box = strip.current;
		if (box === null) return;
		box.scrollLeft += dir * (box.clientWidth * 0.7);
		// the strip scrolls instantly, so the arrows and the thumb can be caught up straight away
		measure();
	};

	const takeCard = (e: ReactPointerEvent<HTMLButtonElement>, uid: number): void => {
		if (!view.draggable) return;
		drag.current = {
			uid,
			el: e.currentTarget,
			x0: e.clientX,
			y0: e.clientY,
			pid: e.pointerId,
			active: false,
			touch: e.pointerType !== "mouse",
		};
	};

	const pickCard = (uid: number): void => {
		if (justDragged.current) {
			justDragged.current = false;
			return;
		}
		view.click(uid);
	};

	const grabBar = (e: ReactPointerEvent<HTMLDivElement>): void => {
		barDrag.current = true;
		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {
			// a pointer that has already gone is nothing to worry about
		}
		barTo(e.clientX);
		e.preventDefault();
	};

	return (
		<div className="handwrap" style={{width: "100%"}}>
			<div className="handrail">
				<button
					type="button"
					className="hscroll"
					aria-label="Scroll hand left"
					disabled={ends.start}
					onClick={() => {
						scrollStrip(-1);
					}}
				>
					‹
				</button>
				<div className="hand" id="hand" ref={strip}>
					{view.cards.length === 0 ? (
						<span className="hint">Nothing in hand yet.</span>
					) : (
						view.cards.map((c) => {
							const held = lift !== null && lift.uid === c.uid ? lift : null;
							const marks = ["hcard"];
							if (c.mixable) marks.push("mixable");
							if (c.doomed) marks.push("doomed");
							if (held !== null) marks.push("dragging");
							if (slot !== null && slot.uid === c.uid) marks.push(slot.side);
							const style: CardStyle = {"--ec": c.colour, "--strip": c.strip};
							if (held !== null) {
								// the card rides with the pointer, but it only ever lifts, never sinks
								const dy = Math.max(-46, Math.min(0, held.dy));
								style.transform = `translate(${held.dx}px, ${dy}px) scale(1.04)`;
							}
							return (
								<button
									key={c.uid}
									type="button"
									className={marks.join(" ")}
									style={style}
									aria-pressed={c.on}
									draggable={false}
									ref={(el) => {
										if (el === null) cards.current.delete(c.uid);
										else cards.current.set(c.uid, el);
									}}
									onPointerDown={(e) => {
										takeCard(e, c.uid);
									}}
									onClick={() => {
										pickCard(c.uid);
									}}
								>
									<div className="ck">{`${c.kind} · ${c.number}`}</div>
									<div className="cn">{c.name}</div>
									<div className="cd">{c.desc}</div>
								</button>
							);
						})
					)}
				</div>
				<button
					type="button"
					className="hscroll"
					aria-label="Scroll hand right"
					disabled={ends.end}
					onClick={() => {
						scrollStrip(1);
					}}
				>
					›
				</button>
			</div>
			<div className="hbar" ref={bar} onPointerDown={grabBar}>
				<div className="hthumb" ref={thumb} style={{width: `${thumbAt.w}px`, left: `${thumbAt.left}px`}} />
			</div>
		</div>
	);
}
