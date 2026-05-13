import { useEffect, useMemo, useState } from "react";
import type { AuthenticatedUser } from "../../auth/types";
import type { AgentProfile, VisualStyleProfile } from "../../orchestration/types";
import type { UploadedAssetRecord } from "../services/BackendAssetPersistenceService";
import {
  createDefaultAgentProfile,
  sanitizeAgentProfile,
} from "../../orchestration/agentProfile";
import type {
  RecentDocumentsStatus,
  StoredDocumentCapabilities,
  StoredDocumentPrimaryMediaKind,
  StoredDocumentSummary,
} from "../types";

interface PersonalCenterViewProps {
  currentUser: AuthenticatedUser | null;
  authStatus: "loading" | "authenticated" | "guest";
  authSubmitting?: boolean;
  authError?: string;
  documents: StoredDocumentSummary[];
  documentsStatus: RecentDocumentsStatus;
  documentsError?: string;
  hasLoadedDocuments: boolean;
  documentsAreRefreshing: boolean;
  currentDocumentId: string;
  onOpenDocument: (documentId: string) => void | Promise<unknown>;
  onCreateNewDocument: () => void | Promise<unknown>;
  onRefreshDocuments: () => void | Promise<unknown>;
  onLogin: (input: {
    email: string;
    password: string;
  }) => void | Promise<unknown>;
  onRegister: (input: {
    email: string;
    password: string;
    displayName?: string;
  }) => void | Promise<unknown>;
  onLogout: () => void | Promise<unknown>;
  activeAgentProfile: AgentProfile | null;
  savedAgentProfiles: AgentProfile[];
  agentProfileBuilderState: {
    isBuilding: boolean;
    summary?: string;
    errorMessage?: string;
    warnings: string[];
  };
  onBuildAgentProfile: (
    plainLanguageBrief: string,
    referenceImages?: Array<{
      assetId?: string;
      title?: string;
      mimeType?: string;
      byteSize?: number;
    }>,
  ) => void | Promise<unknown>;
  onSaveAgentProfile: (profile: AgentProfile) => void | Promise<unknown>;
  onSelectAgentProfile: (profile: AgentProfile | null) => void | Promise<unknown>;
  onRestoreDefaultAgentProfile: () => void | Promise<unknown>;
  visualReferenceState: {
    isUploading: boolean;
    isAnalyzing: boolean;
    uploadedAssets: UploadedAssetRecord[];
    statusMessage?: string;
    errorMessage?: string;
    warnings: string[];
  };
  visualStyleProfiles: VisualStyleProfile[];
  activeVisualStyleProfileIds: string[];
  onUploadVisualReference: (file: File) => void | Promise<unknown>;
  onAnalyzeVisualReference: (input: {
    assetId: string;
    title?: string;
  }) => void | Promise<unknown>;
  onToggleVisualStyleProfile: (profileId: string) => void | Promise<unknown>;
  isLoading?: boolean;
}

const formatRecentLabel = (updatedAt: string) =>
  new Date(updatedAt).toLocaleString();

const formatShortDocumentId = (documentId: string) =>
  documentId.length > 12 ? documentId.slice(0, 8) : documentId;

const formatPrimaryMediaKind = (mediaKind: StoredDocumentPrimaryMediaKind) => {
  switch (mediaKind) {
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "mixed":
      return "Mixed";
    case "live":
      return "Live";
    default:
      return "Empty";
  }
};

const deriveCapabilityLabels = (capabilities: StoredDocumentCapabilities) => {
  const labels: string[] = [];

  if (capabilities.hasAIGeneration) {
    labels.push("AI");
  }

  if (capabilities.hasLiveBlock) {
    labels.push("Live Block");
  }

  if (capabilities.usesLiveSignals) {
    labels.push("Live Signals");
  }

  if (capabilities.requiresCameraPermission) {
    labels.push("Camera");
  }

  if (capabilities.hasVideoMedia) {
    labels.push("Video");
  } else if (capabilities.hasImageMedia) {
    labels.push("Image");
  }

  return labels.length > 0 ? labels : ["Static"];
};

export function PersonalCenterView({
  currentUser,
  authStatus,
  authSubmitting = false,
  authError,
  documents,
  documentsStatus,
  documentsError,
  hasLoadedDocuments,
  documentsAreRefreshing,
  currentDocumentId,
  onOpenDocument,
  onCreateNewDocument,
  onRefreshDocuments,
  onLogin,
  onRegister,
  onLogout,
  activeAgentProfile,
  savedAgentProfiles,
  agentProfileBuilderState,
  onBuildAgentProfile,
  onSaveAgentProfile,
  onSelectAgentProfile,
  onRestoreDefaultAgentProfile,
  visualReferenceState,
  visualStyleProfiles,
  activeVisualStyleProfileIds,
  onUploadVisualReference,
  onAnalyzeVisualReference,
  onToggleVisualStyleProfile,
  isLoading = false,
}: PersonalCenterViewProps) {
  const [activeSection, setActiveSection] = useState<"sketches" | "assets">(
    "sketches",
  );
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const fallbackAgentProfile = useMemo(() => createDefaultAgentProfile(), []);
  const currentAgentProfile = activeAgentProfile ?? fallbackAgentProfile;
  const [agentBrief, setAgentBrief] = useState(
    currentAgentProfile.plainLanguageBrief,
  );
  const [agentJsonDraft, setAgentJsonDraft] = useState(
    JSON.stringify(currentAgentProfile, null, 2),
  );
  const [agentJsonError, setAgentJsonError] = useState<string | undefined>();
  const currentAgentProfileJson = JSON.stringify(currentAgentProfile);
  const hasUnsavedAgentProfileChanges = Boolean(
    activeAgentProfile &&
      !savedAgentProfiles.some(
        (profile) => JSON.stringify(profile) === currentAgentProfileJson,
      ),
  );
  const showLoadingState =
    !hasLoadedDocuments && documentsStatus === "loading" && documents.length === 0;
  const showErrorState = documentsStatus === "error" && documents.length === 0;

  useEffect(() => {
    setAgentBrief(currentAgentProfile.plainLanguageBrief);
    setAgentJsonDraft(JSON.stringify(currentAgentProfile, null, 2));
    setAgentJsonError(undefined);
  }, [currentAgentProfile]);

  const handleSubmit = () => {
    if (authMode === "login") {
      void onLogin({
        email,
        password,
      });
      return;
    }

    void onRegister({
      email,
      password,
      displayName,
    });
  };

  const handleBuildProfile = () => {
    void onBuildAgentProfile(
      agentBrief,
      visualReferenceState.uploadedAssets.map((asset) => ({
        assetId: asset.id,
        title: asset.fileName,
        mimeType: asset.mimeType,
        byteSize: asset.byteSize,
      })).slice(0, 3),
    );
  };

  const handleSaveProfile = () => {
    try {
      const parsed = JSON.parse(agentJsonDraft) as unknown;
      const profile = sanitizeAgentProfile(parsed);

      setAgentJsonError(undefined);
      void onSaveAgentProfile(profile);
    } catch (error) {
      setAgentJsonError(
        error instanceof Error
          ? error.message
          : "Profile JSON could not be parsed.",
      );
    }
  };

  const handleSaveActiveProfile = () => {
    void onSaveAgentProfile(currentAgentProfile);
  };

  const handleRestoreDefault = () => {
    const profile = createDefaultAgentProfile();

    setAgentBrief(profile.plainLanguageBrief);
    setAgentJsonDraft(JSON.stringify(profile, null, 2));
    setAgentJsonError(undefined);
    void onRestoreDefaultAgentProfile();
  };

  const handleVisualReferenceUpload = (file: File | undefined) => {
    if (!file) {
      return;
    }

    void onUploadVisualReference(file);
  };

  return (
    <section className="personal-center">
      <aside className="personal-center__sidebar">
        <div className="personal-center__brand">
          <div className="personal-center__avatar" aria-hidden="true" />
          <div className="personal-center__brand-copy">
            <strong>
              {currentUser
                ? `Welcome back, ${currentUser.displayName}!`
                : "Sign in to Structured Dreams"}
            </strong>
            <span>
              {currentUser
                ? currentUser.email
                : "Access your saved sketches and personal library."}
            </span>
          </div>
        </div>

        <nav className="personal-center__nav">
          <button
            type="button"
            className={`personal-center__nav-item ${
              activeSection === "sketches" ? "is-active" : ""
            }`}
            onClick={() => setActiveSection("sketches")}
          >
            My Sketches
          </button>
          <button
            type="button"
            className={`personal-center__nav-item ${
              activeSection === "assets" ? "is-active" : ""
            }`}
            onClick={() => setActiveSection("assets")}
          >
            Assets
          </button>
          <button type="button" className="personal-center__nav-item" disabled>
            Collections
          </button>
        </nav>

        {currentUser ? (
          <button
            type="button"
            className="secondary-button personal-center__auth-button"
            onClick={() => void onLogout()}
          >
            Log Out
          </button>
        ) : null}
      </aside>

      <div className="personal-center__main">
        <div className="personal-center__main-header">
          <div className="personal-center__main-copy">
            <h2>
              {currentUser
                ? activeSection === "assets"
                  ? "Assets"
                  : "My Sketches"
                : "Account Access"}
            </h2>
          </div>

          {currentUser && activeSection === "sketches" ? (
            <div className="personal-center__toolbar">
              <button
                type="button"
                className="secondary-button"
                onClick={() => void onCreateNewDocument()}
              >
                New Sketch
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void onRefreshDocuments()}
                disabled={documentsAreRefreshing}
              >
                {documentsAreRefreshing ? "Refreshing..." : "Refresh List"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="personal-center__table-card">
          {!currentUser ? (
            <div className="personal-center__auth-card">
              <div className="personal-center__auth-toggle">
                <button
                  type="button"
                  className={`personal-center__auth-tab ${
                    authMode === "login" ? "is-active" : ""
                  }`}
                  disabled={authSubmitting || authStatus === "loading"}
                  onClick={() => setAuthMode("login")}
                >
                  Login
                </button>
                <button
                  type="button"
                  className={`personal-center__auth-tab ${
                    authMode === "register" ? "is-active" : ""
                  }`}
                  disabled={authSubmitting || authStatus === "loading"}
                  onClick={() => setAuthMode("register")}
                >
                  Register
                </button>
              </div>

              <div className="personal-center__auth-form">
                {authMode === "register" ? (
                  <label className="field">
                    <span>Name</span>
                    <input
                      className="text-input"
                      type="text"
                      value={displayName}
                      disabled={authSubmitting || authStatus === "loading"}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="Your display name"
                    />
                  </label>
                ) : null}

                <label className="field">
                  <span>Email</span>
                  <input
                    className="text-input"
                    type="email"
                    value={email}
                    disabled={authSubmitting || authStatus === "loading"}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </label>

                <label className="field">
                  <span>Password</span>
                  <input
                    className="text-input"
                    type="password"
                    value={password}
                    disabled={authSubmitting || authStatus === "loading"}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                  />
                </label>

                {authError ? (
                  <p className="personal-center__auth-error">{authError}</p>
                ) : authStatus === "loading" ? (
                  <p className="personal-center__state">
                    Checking your current session...
                  </p>
                ) : null}

                <button
                  type="button"
                  className="primary-button personal-center__auth-submit"
                  disabled={authSubmitting || authStatus === "loading"}
                  onClick={handleSubmit}
                >
                  {authSubmitting || authStatus === "loading"
                    ? authMode === "login"
                      ? "Signing In..."
                      : "Creating Account..."
                    : authMode === "login"
                      ? "Login"
                      : "Create Account"}
                </button>
              </div>
            </div>
          ) : activeSection === "assets" ? (
            <div className="personal-center__agent-panel">
              <div
                className="personal-center__section-heading"
                title="Build and switch reusable agent profiles. Profiles influence taste and behavior, not hard layout permissions. Describe the taste, behavior, and live-direction instincts you want your AI Design Director to use."
              >
                <strong>AI Design Director</strong>
                <span>Profiles guide taste, not layout ownership.</span>
              </div>

              <div className="personal-center__agent-profile-card">
                <span>Active profile</span>
                <strong>{currentAgentProfile.designDirection}</strong>
                <small>
                  {currentAgentProfile.agentName} · Composition:{" "}
                  {currentAgentProfile.compositionBias} · Risk:{" "}
                  {currentAgentProfile.riskLevel.toFixed(2)} · Density:{" "}
                  {currentAgentProfile.visualDensity.toFixed(2)}
                </small>
                {hasUnsavedAgentProfileChanges ? (
                  <small className="personal-center__unsaved-profile">
                    Unsaved profile changes
                  </small>
                ) : null}
              </div>

              <div className="personal-center__profile-list">
                <button
                  type="button"
                  className={`personal-center__profile-option ${
                    activeAgentProfile ? "" : "is-active"
                  }`}
                  onClick={() => void onSelectAgentProfile(null)}
                >
                  <strong>Default AI Design Director</strong>
                  <span>Base system behavior without custom profile bias.</span>
                </button>

                {savedAgentProfiles.map((profile, index) => (
                  <button
                    type="button"
                    key={`${profile.agentName}-${index}`}
                    className={`personal-center__profile-option ${
                      activeAgentProfile &&
                      JSON.stringify(activeAgentProfile) === JSON.stringify(profile)
                        ? "is-active"
                        : ""
                    }`}
                    onClick={() => void onSelectAgentProfile(profile)}
                  >
                    <strong>{profile.agentName}</strong>
                    <span>
                      {profile.compositionBias} · Risk {profile.riskLevel.toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>

              <details className="personal-center__agent-advanced">
                <summary>Advanced JSON Editor</summary>
                <textarea
                  className="textarea-input personal-center__agent-json"
                  value={agentJsonDraft}
                  onChange={(event) => {
                    setAgentJsonDraft(event.target.value);
                    setAgentJsonError(undefined);
                  }}
                  spellCheck={false}
                />
                <div className="personal-center__agent-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleSaveProfile}
                  >
                    Save JSON Draft
                  </button>
                </div>
                {agentJsonError ? (
                  <p className="personal-center__auth-error">{agentJsonError}</p>
                ) : (
                  <p className="personal-center__state">
                    JSON is sanitized before saving, and cannot grant layout or
                    system-prompt override powers.
                  </p>
                )}
              </details>

              <div
                className="personal-center__section-heading"
                title="Natural language and optional reference images work together as the source material for the next AI-built profile."
              >
                <strong>Create or Refresh a Profile</strong>
                <span>Use words and references to shape the next profile.</span>
              </div>

              <label className="field">
                <span>Natural Language Direction</span>
                <textarea
                  className="textarea-input personal-center__agent-brief"
                  value={agentBrief}
                  onChange={(event) => setAgentBrief(event.target.value)}
                  placeholder="Describe how you want your AI design director to work..."
                />
              </label>

              <div
                className="personal-center__section-heading"
                title="Optional images help the AI understand composition, typography, color, and graphic treatment while building this AgentProfile. Up to 3 references are used during profile building."
              >
                <strong>Reference Images</strong>
                <span>Up to three references guide composition and type.</span>
              </div>

              <div className="personal-center__visual-reference-card">
                <label className="field">
                  <span>Reference image</span>
                  <input
                    className="text-input"
                    type="file"
                    accept="image/*"
                    disabled={visualReferenceState.isUploading}
                    onChange={(event) =>
                      handleVisualReferenceUpload(event.target.files?.[0])
                    }
                  />
                </label>

                {visualReferenceState.uploadedAssets.length > 0 ? (
                  <div className="personal-center__visual-reference-grid">
                    {visualReferenceState.uploadedAssets.map((asset, index) => (
                      <div
                        key={asset.id}
                        className="personal-center__visual-reference-preview"
                      >
                        <img
                          src={asset.publicUrl}
                          alt={asset.fileName}
                        />
                        <div>
                          <strong>{asset.fileName}</strong>
                          <span>
                            {asset.mimeType} ·{" "}
                            {Math.round(asset.byteSize / 1024)} KB
                          </span>
                          <span>
                            {index < 3
                              ? "Used for next profile build"
                              : "Saved reference, not sent in next build"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="personal-center__state">
                    No reference images yet. Build Profile still works with
                    natural language only.
                  </p>
                )}

                {visualReferenceState.errorMessage ? (
                  <p className="personal-center__auth-error">
                    {visualReferenceState.errorMessage}
                  </p>
                ) : visualReferenceState.statusMessage ? (
                  <p className="personal-center__agent-summary">
                    {visualReferenceState.statusMessage}
                  </p>
                ) : null}

                {visualReferenceState.warnings.length > 0 ? (
                  <div className="personal-center__inline-warning">
                    {visualReferenceState.warnings.join(" ")}
                  </div>
                ) : null}
              </div>

              <div className="personal-center__agent-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={agentProfileBuilderState.isBuilding}
                  onClick={handleBuildProfile}
                >
                  {agentProfileBuilderState.isBuilding
                    ? "Building Profile..."
                    : "Build Profile with AI"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleRestoreDefault}
                >
                  Restore Default
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={agentProfileBuilderState.isBuilding}
                  onClick={handleSaveActiveProfile}
                >
                  {hasUnsavedAgentProfileChanges
                    ? "Save Updated Profile"
                    : "Save Active Profile"}
                </button>
              </div>

              {agentProfileBuilderState.errorMessage ? (
                <p className="personal-center__auth-error">
                  {agentProfileBuilderState.errorMessage}
                </p>
              ) : agentProfileBuilderState.summary ? (
                <p className="personal-center__agent-summary">
                  {agentProfileBuilderState.summary}
                </p>
              ) : null}

              {agentProfileBuilderState.warnings.length > 0 ? (
                <div className="personal-center__inline-warning">
                  {agentProfileBuilderState.warnings.join(" ")}
                </div>
              ) : null}

              {visualStyleProfiles.length > 0 ? (
                <details className="personal-center__agent-advanced">
                  <summary>Legacy VisualStyleProfile Library</summary>
                  <p className="personal-center__state">
                    These older analyzed profiles remain available for
                    compatibility, but the main workflow now folds reference
                    images directly into AgentProfile building.
                  </p>
                  <div className="personal-center__style-profile-list">
                    {visualStyleProfiles.map((profile) => (
                      <article
                        key={profile.id}
                        className="personal-center__style-profile"
                      >
                        <div>
                          <strong>{profile.title}</strong>
                          <span>{profile.summary}</span>
                        </div>
                        <small>{profile.composition}</small>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void onToggleVisualStyleProfile(profile.id)}
                        >
                          {activeVisualStyleProfileIds.includes(profile.id)
                            ? "Active"
                            : "Use Legacy Style"}
                        </button>
                      </article>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : (
            <>
          <div className="personal-center__table-header">
            <span>Sketch</span>
            <span>Updated</span>
            <span>Media</span>
            <span>Signals</span>
            <span>Visibility</span>
          </div>

          {showLoadingState ? (
            <div className="personal-center__state">
              Loading saved Structured Dreams documents...
            </div>
          ) : showErrorState ? (
            <div className="personal-center__state personal-center__state--error">
              <strong>Could not load saved documents.</strong>
              <span>{documentsError ?? "The recent document request failed."}</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="personal-center__state">
              {documentsAreRefreshing ? (
                <span>Refreshing saved documents...</span>
              ) : null}
              No saved documents yet. Use Save in the editor or start a new
              sketch here.
            </div>
          ) : (
            <div className="personal-center__table-body">
              {documentsStatus === "error" && documentsError ? (
                <div className="personal-center__inline-warning">
                  {documentsError}
                </div>
              ) : null}
              {documentsAreRefreshing ? (
                <div className="personal-center__inline-warning">
                  Refreshing saved documents...
                </div>
              ) : null}

              {documents.map((document) => {
                const capabilityLabels = deriveCapabilityLabels(
                  document.capabilities,
                );
                const isCurrentDocument = document.id === currentDocumentId;

                return (
                  <article
                    key={document.id}
                    className="personal-center__row"
                  >
                    <div className="personal-center__cell personal-center__cell--name">
                      <button
                        type="button"
                        className="personal-center__document-link"
                        disabled={isLoading}
                        onClick={() => void onOpenDocument(document.id)}
                      >
                        {document.name}
                      </button>
                      <span>
                        {formatShortDocumentId(document.id)}
                        {isCurrentDocument ? " · Current" : ""}
                      </span>
                    </div>

                    <div className="personal-center__cell">
                      <span>{formatRecentLabel(document.updatedAt)}</span>
                    </div>

                    <div className="personal-center__cell">
                      <span>{formatPrimaryMediaKind(document.primaryMediaKind)}</span>
                    </div>

                    <div className="personal-center__cell personal-center__cell--tags">
                      <div className="personal-center__tags">
                        {capabilityLabels.map((label) => (
                          <span
                            key={`${document.id}-${label}`}
                            className="personal-center__tag"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="personal-center__cell">
                      <span>{document.visibility}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
