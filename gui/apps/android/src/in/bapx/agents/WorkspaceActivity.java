package in.bapx.agents;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class WorkspaceActivity extends Activity {
    private TextView status;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        content.setBackgroundColor(0xff0a0a0a);
        content.setPadding(dp(24), dp(24), dp(24), dp(24));

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.bapx_agents_icon);
        logo.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        content.addView(logo, new LinearLayout.LayoutParams(dp(80), dp(80)));

        TextView title = new TextView(this);
        title.setGravity(Gravity.CENTER);
        title.setText("bapX Agents");
        title.setTextColor(Color.WHITE);
        title.setTextSize(28);
        content.addView(title);

        Button open = new Button(this);
        open.setText("Open workspace");
        open.setAllCaps(false);
        open.setOnClickListener(view -> openWorkspace());
        content.addView(open);

        status = new TextView(this);
        status.setTextColor(Color.WHITE);
        status.setGravity(Gravity.CENTER);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        status.setVisibility(View.GONE);
        content.addView(status);
        setContentView(content);

        if (savedInstanceState == null) openWorkspace();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void openWorkspace() {
        Uri workspace = Uri.parse(getString(R.string.workspace_url));
        Intent tab = new Intent(Intent.ACTION_VIEW, workspace);
        tab.addCategory(Intent.CATEGORY_BROWSABLE);
        // Opt in to a Custom Tab with the preferred browser and its existing cookie store.
        // Browsers that do not support Custom Tabs open the same HTTPS URL normally.
        Bundle extras = new Bundle();
        extras.putBinder("android.support.customtabs.extra.SESSION", null);
        tab.putExtras(extras);
        try {
            startActivity(tab);
            status.setVisibility(View.GONE);
        } catch (ActivityNotFoundException error) {
            status.setText("Install a web browser to open your workspace.");
            status.setVisibility(View.VISIBLE);
        }
    }
}
