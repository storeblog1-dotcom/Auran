"""add reliable direct messaging v2 state and private realtime policies

Revision ID: 20260730_direct_message_v2
Revises: 20260730_push_notifications
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260730_direct_message_v2"
down_revision = "20260730_push_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chat_messages",
        sa.Column(
            "client_message_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_unique_constraint(
        "uq_chat_messages_sender_client_message",
        "chat_messages",
        ["sender_id", "client_message_id"],
    )
    op.create_index(
        "ix_chat_messages_room_created_id",
        "chat_messages",
        ["room_id", "created_at", "id"],
    )
    op.add_column(
        "chat_room_members",
        sa.Column(
            "last_delivered_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_table(
        "direct_user_presence",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "last_active_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_index(
        "ix_direct_user_presence_last_active_at",
        "direct_user_presence",
        ["last_active_at"],
    )

    # Supabase Realtime evaluates these SECURITY DEFINER helpers from its
    # realtime.messages policies. The strict topic parsing prevents UUID-cast
    # errors for unrelated channel names.
    op.execute(
        r"""
        CREATE OR REPLACE FUNCTION public.direct_realtime_room_access(
            requested_topic text
        )
        RETURNS boolean
        LANGUAGE plpgsql
        STABLE
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            requested_room uuid;
            claim_user uuid;
        BEGIN
            IF requested_topic IS NULL OR requested_topic !~
                '^dm:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            THEN
                RETURN false;
            END IF;
            BEGIN
                requested_room := substring(requested_topic FROM 4)::uuid;
                claim_user := nullif(
                    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
                    ''
                )::uuid;
            EXCEPTION WHEN OTHERS THEN
                RETURN false;
            END;
            RETURN claim_user IS NOT NULL AND EXISTS (
                SELECT 1
                FROM public.chat_room_members AS membership
                JOIN public.chat_rooms AS room
                  ON room.id = membership.room_id
                WHERE membership.room_id = requested_room
                  AND membership.user_id = claim_user
                  AND room.request_status IN ('ACCEPTED', 'PENDING')
                  AND (
                      EXISTS (
                          SELECT 1
                          FROM public.chat_room_members AS admin_membership
                          JOIN public.users AS admin_user
                            ON admin_user.id = admin_membership.user_id
                          WHERE admin_membership.room_id = requested_room
                            AND admin_user.is_admin = true
                      )
                      OR NOT EXISTS (
                          SELECT 1
                          FROM public.chat_room_members AS other_membership
                          JOIN public.user_blocks AS blocked
                            ON (
                                blocked.blocker_id = claim_user
                                AND blocked.blocked_id =
                                    other_membership.user_id
                            ) OR (
                                blocked.blocker_id =
                                    other_membership.user_id
                                AND blocked.blocked_id = claim_user
                            )
                          WHERE other_membership.room_id = requested_room
                            AND other_membership.user_id <> claim_user
                      )
                  )
            );
        END;
        $$;
        """
    )
    op.execute(
        r"""
        CREATE OR REPLACE FUNCTION public.direct_realtime_presence_read_access(
            requested_topic text
        )
        RETURNS boolean
        LANGUAGE plpgsql
        STABLE
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            target_user uuid;
            claim_user uuid;
        BEGIN
            IF requested_topic IS NULL OR requested_topic !~
                '^dm-user:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            THEN
                RETURN false;
            END IF;
            BEGIN
                target_user := substring(requested_topic FROM 9)::uuid;
                claim_user := nullif(
                    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
                    ''
                )::uuid;
            EXCEPTION WHEN OTHERS THEN
                RETURN false;
            END;
            IF claim_user IS NULL THEN
                RETURN false;
            END IF;
            IF claim_user = target_user THEN
                RETURN true;
            END IF;
            RETURN EXISTS (
                SELECT 1
                FROM public.chat_room_members AS mine
                JOIN public.chat_room_members AS peer
                  ON peer.room_id = mine.room_id
                JOIN public.chat_rooms AS room
                  ON room.id = mine.room_id
                WHERE mine.user_id = claim_user
                  AND peer.user_id = target_user
                  AND room.request_status = 'ACCEPTED'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM public.user_blocks AS blocked
                      WHERE (
                          blocked.blocker_id = claim_user
                          AND blocked.blocked_id = target_user
                      ) OR (
                          blocked.blocker_id = target_user
                          AND blocked.blocked_id = claim_user
                      )
                  )
            );
        END;
        $$;
        """
    )
    op.execute(
        r"""
        CREATE OR REPLACE FUNCTION public.direct_realtime_presence_write_access(
            requested_topic text
        )
        RETURNS boolean
        LANGUAGE plpgsql
        STABLE
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            target_user uuid;
            claim_user uuid;
        BEGIN
            IF requested_topic IS NULL OR requested_topic !~
                '^dm-user:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            THEN
                RETURN false;
            END IF;
            BEGIN
                target_user := substring(requested_topic FROM 9)::uuid;
                claim_user := nullif(
                    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
                    ''
                )::uuid;
            EXCEPTION WHEN OTHERS THEN
                RETURN false;
            END;
            RETURN claim_user IS NOT NULL AND claim_user = target_user;
        END;
        $$;
        """
    )
    op.execute(
        """
        DO $policy$
        BEGIN
            IF to_regclass('realtime.messages') IS NOT NULL
               AND EXISTS (
                   SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'
               )
            THEN
                REVOKE ALL ON FUNCTION
                    public.direct_realtime_room_access(text) FROM PUBLIC;
                REVOKE ALL ON FUNCTION
                    public.direct_realtime_presence_read_access(text) FROM PUBLIC;
                REVOKE ALL ON FUNCTION
                    public.direct_realtime_presence_write_access(text) FROM PUBLIC;
                GRANT EXECUTE ON FUNCTION
                    public.direct_realtime_room_access(text) TO authenticated;
                GRANT EXECUTE ON FUNCTION
                    public.direct_realtime_presence_read_access(text) TO authenticated;
                GRANT EXECUTE ON FUNCTION
                    public.direct_realtime_presence_write_access(text) TO authenticated;

                EXECUTE 'DROP POLICY IF EXISTS "auran_dm_realtime_read" ON realtime.messages';
                EXECUTE 'DROP POLICY IF EXISTS "auran_dm_realtime_write" ON realtime.messages';
                EXECUTE $read$
                    CREATE POLICY "auran_dm_realtime_read"
                    ON realtime.messages
                    FOR SELECT
                    TO authenticated
                    USING (
                        (
                            realtime.messages.extension = 'broadcast'
                            AND public.direct_realtime_room_access(
                                (SELECT realtime.topic())
                            )
                        )
                        OR (
                            realtime.messages.extension = 'presence'
                            AND public.direct_realtime_presence_read_access(
                                (SELECT realtime.topic())
                            )
                        )
                    )
                $read$;
                EXECUTE $write$
                    CREATE POLICY "auran_dm_realtime_write"
                    ON realtime.messages
                    FOR INSERT
                    TO authenticated
                    WITH CHECK (
                        (
                            realtime.messages.extension = 'presence'
                            AND public.direct_realtime_presence_write_access(
                                (SELECT realtime.topic())
                            )
                        )
                        OR (
                            realtime.messages.extension = 'broadcast'
                            AND realtime.messages.event = 'typing'
                            AND public.direct_realtime_room_access(
                                (SELECT realtime.topic())
                            )
                            AND realtime.messages.payload ->> 'user_id' =
                                nullif(
                                    current_setting(
                                        'request.jwt.claims',
                                        true
                                    )::jsonb ->> 'sub',
                                    ''
                                )
                            AND realtime.messages.payload ->> 'room_id' =
                                substring(
                                    (SELECT realtime.topic())
                                    FROM 4
                                )
                            AND jsonb_typeof(
                                realtime.messages.payload -> 'is_typing'
                            ) = 'boolean'
                        )
                    )
                $write$;
            END IF;
        END
        $policy$;
        """
    )

    # Custom database broadcasts include the sender summary so the client can
    # render the committed message immediately without a follow-up API read.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.broadcast_direct_message_created()
        RETURNS trigger
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            sender_payload jsonb;
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_catalog.pg_proc AS proc
                JOIN pg_catalog.pg_namespace AS namespace
                  ON namespace.oid = proc.pronamespace
                WHERE namespace.nspname = 'realtime'
                  AND proc.proname = 'send'
            ) THEN
                SELECT jsonb_build_object(
                    'id', app_user.id,
                    'username', app_user.username,
                    'nickname', app_user.nickname,
                    'full_name', app_user.full_name,
                    'profile_image_url', app_user.profile_image_url,
                    'is_admin', app_user.is_admin
                )
                INTO sender_payload
                FROM public.users AS app_user
                WHERE app_user.id = NEW.sender_id;

                PERFORM realtime.send(
                    jsonb_build_object(
                        'room_id', NEW.room_id,
                        'message', jsonb_build_object(
                            'id', NEW.id,
                            'room_id', NEW.room_id,
                            'client_message_id', NEW.client_message_id,
                            'sender', sender_payload,
                            'content', NEW.content,
                            'message_type', NEW.message_type,
                            'media_url', NEW.media_url,
                            'shared_post_id', NEW.shared_post_id,
                            'delivery_status', 'SENT',
                            'delivered_at', NULL,
                            'read_at', NULL,
                            'created_at', NEW.created_at
                        )
                    ),
                    'message.created',
                    'dm:' || NEW.room_id::text,
                    true
                );
            END IF;
            RETURN NEW;
        END;
        $$;
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.broadcast_direct_message_checkpoint()
        RETURNS trigger
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_catalog.pg_proc AS proc
                JOIN pg_catalog.pg_namespace AS namespace
                  ON namespace.oid = proc.pronamespace
                WHERE namespace.nspname = 'realtime'
                  AND proc.proname = 'send'
            ) THEN
                IF NEW.last_delivered_at IS DISTINCT FROM OLD.last_delivered_at
                THEN
                    PERFORM realtime.send(
                        jsonb_build_object(
                            'room_id', NEW.room_id,
                            'user_id', NEW.user_id,
                            'delivered_at', NEW.last_delivered_at
                        ),
                        'message.delivered',
                        'dm:' || NEW.room_id::text,
                        true
                    );
                END IF;
                IF NEW.last_read_at IS DISTINCT FROM OLD.last_read_at THEN
                    PERFORM realtime.send(
                        jsonb_build_object(
                            'room_id', NEW.room_id,
                            'user_id', NEW.user_id,
                            'read_at', NEW.last_read_at
                        ),
                        'message.read',
                        'dm:' || NEW.room_id::text,
                        true
                    );
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$;
        """
    )
    op.execute(
        """
        CREATE TRIGGER broadcast_direct_message_created_trigger
        AFTER INSERT ON public.chat_messages
        FOR EACH ROW
        EXECUTE FUNCTION public.broadcast_direct_message_created()
        """
    )
    op.execute(
        """
        CREATE TRIGGER broadcast_direct_message_checkpoint_trigger
        AFTER UPDATE OF last_delivered_at, last_read_at
        ON public.chat_room_members
        FOR EACH ROW
        EXECUTE FUNCTION public.broadcast_direct_message_checkpoint()
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TRIGGER IF EXISTS broadcast_direct_message_checkpoint_trigger
        ON public.chat_room_members
        """
    )
    op.execute(
        """
        DROP TRIGGER IF EXISTS broadcast_direct_message_created_trigger
        ON public.chat_messages
        """
    )
    op.execute(
        "DROP FUNCTION IF EXISTS public.broadcast_direct_message_checkpoint()"
    )
    op.execute(
        "DROP FUNCTION IF EXISTS public.broadcast_direct_message_created()"
    )
    op.execute(
        """
        DO $policy$
        BEGIN
            IF to_regclass('realtime.messages') IS NOT NULL THEN
                EXECUTE 'DROP POLICY IF EXISTS "auran_dm_realtime_write" ON realtime.messages';
                EXECUTE 'DROP POLICY IF EXISTS "auran_dm_realtime_read" ON realtime.messages';
            END IF;
        END
        $policy$;
        """
    )
    op.execute(
        "DROP FUNCTION IF EXISTS public.direct_realtime_presence_write_access(text)"
    )
    op.execute(
        "DROP FUNCTION IF EXISTS public.direct_realtime_presence_read_access(text)"
    )
    op.execute(
        "DROP FUNCTION IF EXISTS public.direct_realtime_room_access(text)"
    )

    op.drop_index(
        "ix_direct_user_presence_last_active_at",
        table_name="direct_user_presence",
    )
    op.drop_table("direct_user_presence")
    op.drop_column("chat_room_members", "last_delivered_at")
    op.drop_index(
        "ix_chat_messages_room_created_id",
        table_name="chat_messages",
    )
    op.drop_constraint(
        "uq_chat_messages_sender_client_message",
        "chat_messages",
        type_="unique",
    )
    op.drop_column("chat_messages", "client_message_id")
