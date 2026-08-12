import {useLayoutEffect, useRef, useState, type ReactElement} from "react";
import type {ChatLine, ChatQuote, ChatView} from "../game/bridge.js";
import {SAY_MAX} from "../game/chat.js";

/** The line an answer was written to, printed above it or in the bar under the log. */
function Quote({quote}: {readonly quote: ChatQuote}): ReactElement {
	return (
		<>
			<b style={{color: quote.colour}}>{quote.who}</b>
			{` ${quote.text}`}
		</>
	);
}

/** One thing said at the table: what it answers, who said it, and the answer offered back. */
function Said({said}: {readonly said: ChatLine}): ReactElement {
	return (
		<p>
			{said.quote !== null && (
				<span className="quote">
					<Quote quote={said.quote} />
				</span>
			)}
			<b style={{color: said.colour}}>{said.who}</b>
			<span className="rnd">{`r${said.round}`}</span>{" "}
			<button type="button" className="reply" onClick={said.reply}>
				reply
			</button>
			<br />
			{said.text}
		</p>
	);
}

/**
 * The table talk box: what has been said, what the next message answers, and the box it is typed
 * in. What is being typed is nobody's business but this box's, so it never leaves here until it is
 * said.
 */
export function TableTalk({view}: {readonly view: ChatView}): ReactElement {
	const [typed, setTyped] = useState("");
	const log = useRef<HTMLDivElement | null>(null);

	// The newest line is the one worth reading, so the log opens at the bottom and stays there.
	useLayoutEffect(() => {
		const box = log.current;
		if (box !== null) box.scrollTop = box.scrollHeight;
	});

	const say = (): void => {
		if (typed.trim().length === 0) return;
		view.say(typed);
		setTyped("");
	};

	return (
		<>
			<div id="chatlog" ref={log}>
				{view.lines.length === 0 ? (
					<p className="none">Nothing said yet.</p>
				) : (
					view.lines.map((said) => <Said key={said.id} said={said} />)
				)}
			</div>
			<div id="replybar">
				{view.replyingTo !== null && (
					<span className="rto">
						{"replying to "}
						<Quote quote={view.replyingTo} />{" "}
						<button type="button" className="reply" onClick={view.cancelReply}>
							cancel
						</button>
					</span>
				)}
			</div>
			<div className="chatrow">
				<input
					maxLength={SAY_MAX}
					placeholder="Say something"
					aria-label="Message the table"
					value={typed}
					onChange={(e) => {
						setTyped(e.target.value);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") say();
					}}
				/>
				<button type="button" className="ghost" onClick={say}>
					Say
				</button>
			</div>
		</>
	);
}
