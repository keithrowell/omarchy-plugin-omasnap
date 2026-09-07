type
  TStack = class
  private
    FItems: array of Integer;
  public
    procedure Push(Value: Integer);
    function Pop: Integer;
  end;

procedure TStack.Push(Value: Integer);
begin
  SetLength(FItems, Length(FItems) + 1);
  FItems[High(FItems)] := Value;
end;

function TStack.Pop: Integer;
begin
  Result := FItems[High(FItems)];
  SetLength(FItems, Length(FItems) - 1);
end;
