'use client';

import { LogOut, UserMinus, Users } from 'lucide-react';
import { UserAvatar } from '@/src/components/common/Identity';
import { ListPanel, ListRow, ListRows, RoleBadge, RowMenu } from '@/src/components/common/ListRow';
import { EmptyState } from '@/src/components/PageStates';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/src/components/primitives/dropdown-menu';
import { prettyDate } from '@/src/format';
import type { Member, Role } from '@/src/workspaceService';
import { ROLES, roleLabel } from '@/src/components/roleLabel';

type Props = {
  members: Member[];
  currentUserId: string;
  /** From the API's `canManageMembers`; false renders a read-only list. */
  canManage: boolean;
  onChangeRole: (member: Member, role: Role) => void;
  onRemove: (member: Member) => void;
  onLeave: () => void;
};

export const memberName = (member: Member) => member.username ?? `User ${member.userId}`;

export function MemberList({
  members,
  currentUserId,
  canManage,
  onChangeRole,
  onRemove,
  onLeave,
}: Props) {
  return (
    <ListPanel id="members-heading" title="Members" count={members.length}>
      {!members.length ? (
        <EmptyState icon={Users} title="This workspace has no members." />
      ) : (
        <ListRows label="Members">
          {members.map((member) => {
            const isSelf = member.userId === currentUserId;
            const name = memberName(member);
            const hasActions = isSelf || canManage;
            return (
              <ListRow
                key={member.userId}
                leading={<UserAvatar id={Number(member.userId) || member.userId} name={name} />}
                title={`${name}${isSelf ? ' (you)' : ''}`}
                detail={`Joined ${prettyDate(member.joinedAt)}`}
                badge={<RoleBadge role={member.role} />}
                actions={
                  hasActions && (
                    <RowMenu label={`Actions for ${name}`}>
                      {canManage && (
                        <>
                          <DropdownMenuLabel>Role</DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={member.role}
                            onValueChange={(role) => {
                              if (role !== member.role) onChangeRole(member, role as Role);
                            }}
                          >
                            {ROLES.map((role) => (
                              <DropdownMenuRadioItem key={role} value={role}>
                                {roleLabel(role)}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      {isSelf ? (
                        <DropdownMenuItem variant="destructive" onSelect={onLeave}>
                          <LogOut /> Leave workspace
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem variant="destructive" onSelect={() => onRemove(member)}>
                          <UserMinus /> Remove {name}
                        </DropdownMenuItem>
                      )}
                    </RowMenu>
                  )
                }
              />
            );
          })}
        </ListRows>
      )}
    </ListPanel>
  );
}
