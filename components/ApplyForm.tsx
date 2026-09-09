"use client";

import { useActionState } from "react";
import { submitApplication, type ApplyState } from "@/app/apply/actions";

const INITIAL: ApplyState = { ok: false };

const SPECIALTIES = [
  { value: "portfolio_audit", label: "Portfolio audits" },
  { value: "fno_systematic", label: "F&O, systematically" },
];

export default function ApplyForm() {
  const [state, action, pending] = useActionState(submitApplication, INITIAL);

  if (state.ok) {
    return (
      <div className="apply-done">
        <h2 className="apply-done-h">That is with us.</h2>
        <p>
          A person reads every application. If it is a fit we will email you a sign-in link and you
          will set your own rate and hours from there.
        </p>
        <p className="bp-muted">
          We do not send a rejection round-robin. If you have not heard from us in two weeks, we are
          not taking anyone on in your area yet — apply again whenever you like.
        </p>
      </div>
    );
  }

  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={action} className="apply-form">
      <div className="apply-row">
        <label className="apply-field">
          <span>Your name</span>
          <input name="name" autoComplete="name" required />
          {err("name") ? <em className="apply-err">{err("name")}</em> : null}
        </label>
        <label className="apply-field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required />
          {err("email") ? <em className="apply-err">{err("email")}</em> : null}
        </label>
      </div>

      <div className="apply-row">
        <label className="apply-field">
          <span>
            Phone <em>optional</em>
          </span>
          <input name="phone" autoComplete="tel" />
        </label>
        <label className="apply-field">
          <span>Years doing this</span>
          <input name="yearsExperience" type="number" min={0} max={60} required />
          {err("yearsExperience") ? <em className="apply-err">{err("yearsExperience")}</em> : null}
        </label>
      </div>

      <label className="apply-field">
        <span>One line, as it would appear on your card</span>
        <input name="headline" placeholder="Portfolio audits · 9 yrs" maxLength={90} required />
        {err("headline") ? <em className="apply-err">{err("headline")}</em> : null}
      </label>

      <label className="apply-field">
        <span>What you actually do in a session</span>
        <textarea
          name="bio"
          rows={5}
          placeholder="Write it the way you would say it to someone on the call."
          required
        />
        {err("bio") ? <em className="apply-err">{err("bio")}</em> : null}
      </label>

      <fieldset className="apply-fieldset">
        <legend>What you take on</legend>
        <div className="apply-checks">
          {SPECIALTIES.map((s) => (
            <label key={s.value} className="apply-check">
              <input type="checkbox" name="specialties" value={s.value} />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
        {err("specialties") ? <em className="apply-err">{err("specialties")}</em> : null}
      </fieldset>

      {/*
        Asked plainly, because the answer is published either way. An expert
        with no registration is listed as "Not registered" rather than left
        blank, and it is fairer to say so here than after someone has put in
        the work of applying.
      */}
      <fieldset className="apply-fieldset">
        <legend>SEBI registration</legend>
        <div className="apply-row">
          <label className="apply-field">
            <span>Type</span>
            <select name="sebiRegType" defaultValue="none">
              <option value="none">Not registered</option>
              <option value="ria">Registered Investment Adviser (RIA)</option>
              <option value="ra">Research Analyst (RA)</option>
            </select>
          </label>
          <label className="apply-field">
            <span>
              Registration number <em>if registered</em>
            </span>
            <input name="sebiRegNumber" placeholder="INA000000000" />
            {err("sebiRegNumber") ? <em className="apply-err">{err("sebiRegNumber")}</em> : null}
          </label>
        </div>
        <p className="apply-hint">
          Either answer is fine. Whichever you give is shown on your profile exactly as it is, and
          we check it before you go live.
        </p>
      </fieldset>

      <label className="apply-field">
        <span>
          Where your work can be seen <em>optional</em>
        </span>
        <input name="links" placeholder="A site, a newsletter, a handle — whatever is real" />
      </label>

      <label className="apply-field">
        <span>
          Anything else <em>optional</em>
        </span>
        <textarea name="note" rows={3} />
      </label>

      {state.error ? <p className="bp-error">{state.error}</p> : null}

      <button className="btn-primary apply-submit" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send application"}
      </button>
      <p className="apply-fine">
        We keep what you send here to assess your application, and nothing else. No part of it is
        published until you are live and have approved your own profile.
      </p>
    </form>
  );
}
